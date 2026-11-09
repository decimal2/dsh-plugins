import { randomBytes, createHash } from 'node:crypto'
import { safeFile, checkStorage, unlinkLog, cleanMetadata, attachmentIds, cleanAttachments } from './storage.mjs'

export function createDeletionController(ctx, handles = new Map()) {
  const tokens = new Map(), deleted = new Set()
  let tail = Promise.resolve()
  const serial = operation => {
    const result = tail.then(operation, operation)
    tail = result.catch(() => {})
    return result
  }
  const assertAvailable = id => { if (id && deleted.has(id)) throw new Error('该会话已永久删除，请新建会话') }
  async function collect(id) {
    if (typeof id !== 'string' || !id || id.length > 256) throw new Error('无效会话 ID')
    assertAvailable(id)
    const p = ctx.get('sessionPersistence'), sessions = ctx.get('sessions'), agents = ctx.get('agents')
    checkStorage(p, ctx.get('workspaceRegistry'), ctx.get('sessionQuery'))
    const headers = new Map((await p.list()).map(h => [h.id, h]))
    for (const s of sessions.list()) headers.set(s.id, s.header)
    const root = headers.get(id)
    if (!root) throw new Error('会话不存在或已经删除')
    if (root.origin === 'subagent') throw new Error('请从所属主会话删除子任务记录')
    const ids = new Set([id])
    for (let changed = true; changed;) {
      changed = false
      for (const h of headers.values()) if (h.origin === 'subagent' && ids.has(h.parentSession) && !ids.has(h.id)) { ids.add(h.id); changed = true }
    }
    for (const childId of ids) {
      const agent = agents.get(childId)
      if (agent && agent.status !== 'idle') throw new Error('会话或其子任务仍在运行，请先停止任务')
      if (sessions.get(childId) && !handles.has(childId) && childId === id) throw new Error('该会话不由此插件管理，请重启 DSH 后重试')
      if (sessions.get(childId) && !agents.get(childId)) throw new Error('会话仍有未结束的后台生命周期')
    }
    // Flush through the official durability checkpoint before issuing confirmation.
    for (const childId of ids) { const s = sessions.get(childId); if (s) await sessions.flush(s) }
    const rows = [], candidates = new Set()
    for (const childId of ids) {
      const header = headers.get(childId), location = p.locate(header)
      if (location?.kind !== 'jsonl') throw new Error('不支持的会话存储格式')
      const info = await safeFile(p.root, location.path)
      const session = sessions.get(childId)
      const events = session?.events ?? (info ? (await p.inspect(childId)).events : [])
      attachmentIds(events, candidates)
      rows.push({ header, size: info?.size || 0, modified: info?.mtimeMs || 0, eventCount: events.length })
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(rows.map(r => [r.header.id, r.size, r.modified, r.eventCount]))).digest('hex')
    return { rows, candidates, fingerprint }
  }
  return {
    serial, assertAvailable, handles, deleted,
    preview: id => serial(async () => {
      const plan = await collect(id)
      for (const [token, item] of tokens) if (item.expires < Date.now()) tokens.delete(token)
      if (tokens.size >= 128) tokens.delete(tokens.keys().next().value)
      const token = randomBytes(24).toString('hex')
      tokens.set(token, { id, fingerprint: plan.fingerprint, expires: Date.now() + 300000 })
      return { token, sessionCount: plan.rows.length, bytes: plan.rows.reduce((n, r) => n + r.size, 0) }
    }),
    remove: (id, token) => serial(async () => {
      const confirmation = tokens.get(token)
      if (!confirmation || confirmation.id !== id || confirmation.expires < Date.now()) throw new Error('删除确认已失效，请重新确认')
      tokens.delete(token)
      const plan = await collect(id)
      if (plan.fingerprint !== confirmation.fingerprint) throw new Error('会话内容已变化，请重新确认删除')
      const sessions = ctx.get('sessions'), persistence = ctx.get('sessionPersistence')
      const deletedIds = [], warnings = []
      let bytes = 0
      const rootHandle = handles.get(id)
      if (rootHandle) { await rootHandle.dispose(); handles.delete(id) }
      // Parent teardown owns subagents; dispose any independently held idle child handles too.
      for (const row of plan.rows) {
        const handle = handles.get(row.header.id)
        if (handle) { await handle.dispose(); handles.delete(row.header.id) }
      }
      if (plan.rows.some(row => sessions.get(row.header.id))) throw new Error('会话尚未完全退出，未删除任何日志')
      try {
        // Children first. A partial filesystem failure leaves the parent available for retry.
        for (const row of [...plan.rows].reverse()) {
          bytes += await unlinkLog(persistence, sessions, row.header)
          deletedIds.push(row.header.id); deleted.add(row.header.id)
        }
      } catch (error) {
        if (!deletedIds.length) throw error
        warnings.push('部分日志未能删除：' + error.message)
      }
      try { await cleanMetadata(ctx.get('workspaceRegistry'), deletedIds, ctx.get('sessionQuery')) }
      catch (error) { warnings.push('日志已删除，但索引清理未完成：' + error.message) }
      const attachments = await cleanAttachments(ctx, plan.candidates, deletedIds)
      bytes += attachments.bytes; warnings.push(...attachments.warnings)
      return { deletedIds, bytes, warnings, complete: deletedIds.length === plan.rows.length }
    }),
  }
}

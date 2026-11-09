import fs from 'node:fs/promises'
import path from 'node:path'

export async function safeFile(root, file) {
  const base = await fs.realpath(root)
  const relative = path.relative(base, path.resolve(file))
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('拒绝删除存储目录之外的文件')
  let cursor = base
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment)
    let info
    try { info = await fs.lstat(cursor) } catch (e) { if (e.code === 'ENOENT') return null; throw e }
    if (info.isSymbolicLink()) throw new Error('拒绝删除符号链接中的会话文件')
    if (cursor === path.resolve(file)) {
      if (!info.isFile()) throw new Error('会话存储目标不是普通文件')
      return info
    }
    if (!info.isDirectory()) throw new Error('会话存储目录无效')
  }
}

export function checkStorage(persistence, registry, query) {
  if (persistence?.name !== 'session-persistence-jsonl' || typeof persistence.acquireLease !== 'function' || !(persistence.coldLogMemo instanceof Map)) throw new Error('当前存储版本不支持安全删除')
  if (!registry || typeof registry.enqueueOperation !== 'function' || ![registry.headers, registry.sessionPaths, registry.invalidSessionPaths].every(v => v instanceof Map)) throw new Error('工作区索引版本不兼容')
  if (query && typeof query._serialized !== 'function') throw new Error('搜索索引版本不兼容')
}
export async function readEvents(persistence, id) {
  const handle = await persistence.open(id, 'read')
  try { return (await handle.read()).events } finally { await handle.close() }
}
export async function artifacts(persistence, file) {
  const dir = path.dirname(file), rows = []
  for (const name of (await fs.readdir(dir)).sort()) {
    if (!/^session(?:\.v[0-9]+)?\.jsonl(?:\.zstd)?$/.test(name)) continue
    const file = path.join(dir, name)
    const stat = await safeFile(persistence.root, file)
    if (stat) rows.push({file, size:stat.size, modified:stat.mtimeMs})
  }
  return rows
}
export async function unlinkLog(persistence, sessions, row) {
  const {header, location} = row
  if (sessions.get(header.id)) throw new Error('会话仍在运行，未删除日志')
  await safeFile(persistence.root, location.path)
  await safeFile(persistence.root,path.join(path.dirname(location.path),'session.lock'))
  const lease = await persistence.acquireLease(header.id, header.cwd, path.dirname(location.path))
  try {
    const files = await artifacts(persistence, location.path)
    if (JSON.stringify(files) !== JSON.stringify(row.files)) throw new Error('会话日志已变化，请重新确认')
    // Historical generations must not resurrect a deleted conversation. Delete current last.
    files.sort((a,b) => Number(a.file === location.path) - Number(b.file === location.path))
    let bytes = 0
    for (const file of files) { await fs.unlink(file.file); bytes += file.size }
    persistence.coldLogMemo.delete(header.id)
    return bytes
  } finally { await lease.release() }
}

export async function cleanMetadata(registry, ids, query) {
  for (const workspace of registry.list()) for (const id of ids) await workspace.detachSession(id)
  await registry.enqueueOperation(async () => {
    const state = registry.requireState()
    const archivedSessionIds = state.archivedSessionIds.filter(id => !ids.includes(id))
    const pinnedSessionIds = state.pinnedSessionIds.filter(id => !ids.includes(id))
    if (archivedSessionIds.length !== state.archivedSessionIds.length || pinnedSessionIds.length !== state.pinnedSessionIds.length) await registry.setState({ ...state, archivedSessionIds, pinnedSessionIds })
    for (const id of ids) {
      registry.headers.delete(id); registry.sessionPaths.delete(id); registry.invalidSessionPaths.delete(id)
    }
  })
  if (!query) return
  // Use the query engine's own queue: never race active SQLite readers/writers.
  await query._serialized(undefined, async () => {
    let exists = Boolean(query._db)
    if (!exists && query.config.path !== ':memory:') {
      try { exists = (await fs.stat(query.config.path)).isFile() } catch (e) { if (e.code !== 'ENOENT') throw e }
    }
    if (!exists) return // Do not build an otherwise disabled search index.
    await query._ensureReady(undefined)
    await query._reconcile(undefined)
    if (query.config.path !== ':memory:') {
      query._db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      query._db.exec('VACUUM')
      query._db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    }
  })
}

export function attachmentIds(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output
  if (typeof value.attachmentId === 'string' && /^sha256:[a-f0-9]{64}$/.test(value.attachmentId)) output.add(value.attachmentId.slice(7))
  for (const child of Object.values(value)) if (child && typeof child === 'object') attachmentIds(child, output)
  return output
}

export async function cleanAttachments(ctx, candidates, deletedIds) {
  const store = ctx.get('attachments'), agents = ctx.get('agents'), persistence = ctx.get('sessionPersistence')
  if (!candidates.size) return { bytes: 0, warnings: [] }
  if (!store || typeof store.root !== 'string') return { bytes: 0, warnings: ['附件后端不支持清理，已保留附件。'] }
  if (agents.list().some(a => a.status !== 'idle')) return { bytes: 0, warnings: ['其他会话仍在运行，附件清理已跳过。'] }
  const retained = new Set()
  try {
    for (const {header} of await persistence.list()) {
      if (!deletedIds.includes(header.id)) attachmentIds(await readEvents(persistence, header.id), retained)
    }
    for (const session of ctx.get('sessions').list()) attachmentIds(session.events, retained)
  } catch { return { bytes: 0, warnings: ['无法完整检查其他会话的附件引用，已保留附件。'] } }
  let bytes = 0
  const warnings = []
  for (const hash of candidates) {
    if (retained.has(hash)) continue
    if (agents.list().some(a => a.status !== 'idle')) { warnings.push('有会话开始运行，剩余附件已保留。'); break }
    try {
      const aliasDir=path.join(store.root,'files',hash.slice(0,2),hash)
      // Check directory ancestors without following a junction, even before listing it.
      await safeFile(store.root,path.join(aliasDir,'.session-delete-probe'))
      const names=await fs.readdir(aliasDir).catch(error=>{if(error.code==='ENOENT') return [];throw error})
      const files=[path.join(store.root,'objects',hash.slice(0,2),hash),
        path.join(store.root,'file-objects',hash.slice(0,2),hash),...names.map(name=>path.join(aliasDir,name))]
      const counted=new Set()
      for(const file of files) {
        const info=await safeFile(store.root,file)
        if(!info) continue
        await fs.unlink(file)
        const inode=String(info.dev)+':'+String(info.ino)
        if(!counted.has(inode)){bytes+=info.size;counted.add(inode)}
      }
      try {await fs.rmdir(aliasDir)} catch {}
    } catch { warnings.push('一个未被其他会话引用的附件未能删除。') }
  }
  return { bytes, warnings }
}

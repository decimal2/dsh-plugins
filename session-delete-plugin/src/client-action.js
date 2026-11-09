// Inserted into the workspace client's module factory by build.mjs.
let sessionDeleteContext
let sessionDeleteState = null
const sessionDeleteListeners = new Set()
const subscribeSessionDelete = listener => { sessionDeleteListeners.add(listener); return () => sessionDeleteListeners.delete(listener) }
const getSessionDeleteState = () => sessionDeleteState
function setSessionDeleteState(value) {
  sessionDeleteState = value
  for (const listener of sessionDeleteListeners) listener()
}
async function sessionDeleteCall(action, body) {
  const response = await fetch('/session-delete/' + action, {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || '删除请求失败')
  return result
}
function closeSessionDelete() {
  if (sessionDeleteState?.phase !== 'deleting') setSessionDeleteState(null)
}
async function deleteSessionPermanently(sessionId, title) {
  if (sessionDeleteState) return
  const request = { sessionId, title, phase: 'loading' }
  setSessionDeleteState(request)
  try {
    const preview = await sessionDeleteCall('preview', { sessionId })
    // Closing the dialog or opening another session invalidates this response.
    if (sessionDeleteState === request) setSessionDeleteState({ ...request, phase: 'ready', preview })
  } catch (error) {
    if (sessionDeleteState === request) setSessionDeleteState({ ...request, phase: 'error', error: error.message })
  }
}
async function confirmSessionDelete() {
  const state = sessionDeleteState
  if (state?.phase !== 'ready') return
  setSessionDeleteState({ ...state, phase: 'deleting' })
  let result
  try {
    result = await sessionDeleteCall('confirm', { sessionId: state.sessionId, token: state.preview.token })
  } catch (error) {
    setSessionDeleteState({ ...state, phase: 'error', error: error.message + '。请关闭后重新确认。' })
    return
  }
  const warnings = [...result.warnings]
  if (!result.complete && !warnings.length) warnings.push('部分聊天记录未能删除，请关闭后重新检查。')
  try {
    const ctx = sessionDeleteContext
    if (ctx) {
      if (result.deletedIds.includes(ctx.sessions.list.getSnapshot().current)) ctx.sessions.clear()
      await Promise.all([ctx.sessions.refresh(), ctx.workspaces.refresh()])
    }
  } catch (error) { warnings.push('删除请求已处理，但列表刷新失败：' + error.message + '。请刷新页面。') }
  setSessionDeleteState(warnings.length ? { ...state, phase: 'done', error: warnings.join('\n') } : null)
}
function SessionDeleteDialog() {
  const state = react.useSyncExternalStore(subscribeSessionDelete, getSessionDeleteState, getSessionDeleteState)
  const { jsx, jsxs, Fragment } = react_jsx_runtime
  const { Modal, Button } = _deepseek_ai_dsh_client_ui_primitives
  const styles = WorkspaceBrowser_module_css_default
  const busy = state?.phase === 'deleting'
  const finished = state?.phase === 'done'
  let description = state ? '将永久删除“' + state.title + '”的聊天记录，无法恢复。' : ''
  if (state?.preview) {
    const preview = state.preview
    if (preview.sessionCount > 1) description += '同时删除 ' + (preview.sessionCount - 1) + ' 个子任务的聊天记录。'
    const size = preview.bytes < 1048576 ? Math.ceil(preview.bytes / 1024) + ' KB' : (preview.bytes / 1048576).toFixed(1) + ' MB'
    description += '日志大小：' + size + '。独立分支和工作区文件会保留。'
  }
  return jsxs(Modal, {
    open: state !== null, onClose: closeSessionDelete, closeLabel: '关闭',
    title: finished ? '删除结果' : '永久删除会话',
    description: finished ? '删除请求已处理，请查看下方提示。' : description,
    footer: jsxs(Fragment, { children: [
      jsx(Button, { variant: 'outline', disabled: busy, onClick: closeSessionDelete, children: finished ? '关闭' : '取消' }),
      !finished && jsx(Button, { variant: 'outline', className: styles.deleteAction, disabled: state?.phase !== 'ready', onClick: confirmSessionDelete, children: busy ? '正在删除…' : '永久删除' }),
    ] }),
    children: [
      (busy || state?.phase === 'loading') && jsx('div', { className: styles.deleteStatus, role: 'status', children: busy ? '正在删除聊天记录…' : '正在检查会话…' }),
      state?.error && jsx('div', { className: styles.renameError, role: 'alert', style: { whiteSpace: 'pre-wrap' }, children: state.error }),
    ],
  })
}

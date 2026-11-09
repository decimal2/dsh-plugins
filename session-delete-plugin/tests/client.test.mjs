import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
const code = await fs.readFile(new URL('../src/client-action.js', import.meta.url), 'utf8')
function fixture(handler) {
  const calls = [], updates = []
  const element = (type, props) => ({ type, props })
  const context = vm.createContext({
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (handler) return handler(url, options)
      return { ok: true, json: async () => ({ ok: true, token: 'single-use', bytes: 1024, sessionCount: 2, deletedIds: ['one'], warnings: [], complete: true }) }
    },
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    react_jsx_runtime: { jsx: element, jsxs: element, Fragment: 'Fragment' },
    _deepseek_ai_dsh_client_ui_primitives: { Modal: 'DSH.Modal', Button: 'DSH.Button' },
    WorkspaceBrowser_module_css_default: { deleteAction: 'native-red', renameError: 'native-error', deleteStatus: 'native-status' },
    runtime: { sessions: { list: { getSnapshot: () => ({ current: 'one' }) }, clear: () => updates.push('clear'), refresh: async () => updates.push('sessions') }, workspaces: { refresh: async () => updates.push('workspaces') } },
  })
  vm.runInContext(code + '\nsessionDeleteContext = runtime', context)
  return { calls, updates, run: expression => vm.runInContext(expression, context) }
}
test('uses DSH Modal and Button; cancel sends no delete', async () => {
  const f = fixture()
  await f.run('deleteSessionPermanently("one", "测试会话")')
  const dialog = f.run('SessionDeleteDialog()')
  assert.equal(dialog.type, 'DSH.Modal')
  assert.equal(dialog.props.open, true)
  assert.match(dialog.props.description, /无法恢复/)
  const [cancel, confirm] = dialog.props.footer.props.children
  assert.equal(confirm.type, 'DSH.Button')
  assert.equal(confirm.props.className, 'native-red')
  assert.equal(confirm.props.disabled, false)
  cancel.props.onClick()
  assert.equal(f.run('SessionDeleteDialog()').props.open, false)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.updates, [])
})
test('confirm deletes once, disables dismissal while busy, and refreshes selection', async () => {
  const f = fixture()
  await f.run('deleteSessionPermanently("one", "测试会话")')
  const pending = f.run('confirmSessionDelete()')
  f.run('closeSessionDelete()')
  const dialog = f.run('SessionDeleteDialog()')
  assert.equal(dialog.props.open, true)
  assert.ok(dialog.props.footer.props.children.every(button => button.props.disabled))
  await f.run('confirmSessionDelete()')
  await pending
  assert.equal(f.calls.length, 2)
  assert.equal(JSON.parse(f.calls[1].options.body).token, 'single-use')
  assert.deepEqual(f.updates, ['clear', 'sessions', 'workspaces'])
  assert.equal(f.run('SessionDeleteDialog()').props.open, false)
})
test('closing a pending preview prevents a late response from reopening the dialog', async () => {
  let resolve
  const f = fixture(() => new Promise(done => { resolve = done }))
  const pending = f.run('deleteSessionPermanently("one", "测试会话")')
  assert.equal(f.run('SessionDeleteDialog()').props.footer.props.children[1].props.disabled, true)
  f.run('closeSessionDelete()')
  resolve({ ok: true, json: async () => ({ ok: true, token: 'stale', bytes: 0, sessionCount: 1 }) })
  await pending
  assert.equal(f.run('SessionDeleteDialog()').props.open, false)
  assert.equal(f.calls.length, 1)
})
test('server errors are displayed inline without browser alerts or retrying a consumed token', async () => {
  const f = fixture(async url => ({ ok: !url.endsWith('confirm'), json: async () => url.endsWith('confirm') ? { ok: false, error: '确认已失效' } : { ok: true, token: 'token', bytes: 0, sessionCount: 1 } }))
  await f.run('deleteSessionPermanently("one", "测试会话")')
  await f.run('confirmSessionDelete()')
  const dialog = f.run('SessionDeleteDialog()')
  assert.equal(dialog.props.children[1].props.role, 'alert')
  assert.match(dialog.props.children[1].props.children, /确认已失效/)
  assert.equal(dialog.props.footer.props.children[1].props.disabled, true)
  await f.run('confirmSessionDelete()')
  assert.equal(f.calls.length, 2)
})
test('partial deletion warnings remain in a result dialog with only a close action', async () => {
  const f = fixture(async () => ({ ok: true, json: async () => ({ ok: true, token: 'token', bytes: 0, sessionCount: 1, deletedIds: ['one'], warnings: ['索引清理未完成'], complete: false }) }))
  await f.run('deleteSessionPermanently("one", "测试会话")')
  await f.run('confirmSessionDelete()')
  const dialog = f.run('SessionDeleteDialog()')
  assert.equal(dialog.props.title, '删除结果')
  assert.match(dialog.props.children[1].props.children, /索引清理未完成/)
  assert.equal(dialog.props.footer.props.children[0].props.children, '关闭')
  assert.equal(dialog.props.footer.props.children[1], false)
})
test('generated workspace mounts the native deletion dialog and contains no browser confirm/alert', async () => {
  const built = await fs.readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.ok(built.includes('(0, react_jsx_runtime.jsx)(SessionDeleteDialog, {})'))
  assert.doesNotMatch(built, /window\.(confirm|alert)\(/)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
let createDeletionController
try { ({ createDeletionController } = await import('../src/delete.mjs')) } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e }
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-delete-'))
  const headers = new Map(), live = new Map(), agents = new Map(), handles = new Map(), snapshots = new Map()
  const invalidated = [], detached = []
  const persistence = {
    root, name: 'session-persistence-jsonl',
    list: async () => [...headers.values()].filter(h => snapshots.has(h.id)),
    inspect: async id => ({ meta: headers.get(id), events: snapshots.get(id) }),
    locate: h => ({ kind: 'jsonl', path: path.join(root, 'project', h.id, 'session.jsonl') }),
    coordinator: { waitForRetirement: async () => {}, serialize: async (_id, fn) => fn(), preparations: { assertWritable() {}, invalidate(id) { invalidated.push(id) } }, states: new Map() },
  }
  const services = {
    sessionPersistence: persistence,
    sessions: { get: id => live.get(id), list: () => [...live.values()], flush: async () => {} },
    agents: { get: id => agents.get(id), list: () => [...agents.values()] },
    workspaceRegistry: { list: () => [{ detachSession: async id => { detached.push(id) } }], enqueueOperation: fn => fn(), requireState: () => ({ archivedSessionIds: ['one'], workspaceIds: [] }), setState: async () => {}, headers: new Map(), sessionPaths: new Map(), invalidSessionPaths: new Map() },
  }
  async function add(id, extra = {}, events = []) {
    const header = { id, cwd: '/project', ...extra }; headers.set(id, header); snapshots.set(id, events)
    const file = persistence.locate(header).path; await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify({ header, events }))
    return file
  }
  return { root, add, headers, snapshots, services, agents, live, handles, invalidated, detached, controller: () => createDeletionController({ get: k => services[k] }, handles) }
}
test('confirmed deletion unlinks logs and child tasks but preserves fork and workspace files', async () => {
  assert.equal(typeof createDeletionController, 'function')
  const f = await fixture()
  try {
    const target = await f.add('one'), child = await f.add('task', { origin: 'subagent', parentSession: 'one' }), fork = await f.add('fork', { parentSession: 'one', seedLength: 1 })
    const ctl = f.controller(), preview = await ctl.preview('one')
    assert.equal(preview.sessionCount, 2)
    const result = await ctl.remove('one', preview.token)
    assert.deepEqual(new Set(result.deletedIds), new Set(['one', 'task']))
    await assert.rejects(fs.stat(target), { code: 'ENOENT' }); await assert.rejects(fs.stat(child), { code: 'ENOENT' })
    assert.ok(await fs.stat(fork)); assert.ok(f.invalidated.includes('one'))
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})
test('requires confirmation and refuses running or externally owned live sessions', async () => {
  assert.equal(typeof createDeletionController, 'function')
  const f = await fixture()
  try {
    const file = await f.add('one'), ctl = f.controller()
    await assert.rejects(ctl.remove('one', 'fake'), /确认/)
    f.agents.set('one', { id: 'one', status: 'running' })
    await assert.rejects(ctl.preview('one'), /运行/)
    f.agents.set('one', { id: 'one', status: 'idle' })
    f.live.set('one', { id: 'one', header: f.headers.get('one'), events: [] })
    await assert.rejects(ctl.preview('one'), /管理|重启/)
    assert.ok(await fs.stat(file))
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})
test('rejects a confirmation after the log changes', async () => {
  assert.equal(typeof createDeletionController, 'function')
  const f = await fixture()
  try {
    const file = await f.add('one'), ctl = f.controller(), preview = await ctl.preview('one')
    await fs.appendFile(file, '\nnew message')
    await assert.rejects(ctl.remove('one', preview.token), /变化|重新确认/)
    assert.ok(await fs.stat(file))
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})

test('attachment cleanup removes exclusive objects and preserves shared objects', async () => {
  const f = await fixture()
  try {
    const exclusive = 'a'.repeat(64), shared = 'b'.repeat(64)
    f.services.attachments = { root: path.join(f.root, 'attachments') }
    for (const hash of [exclusive, shared]) {
      const file = path.join(f.services.attachments.root, 'objects', hash.slice(0, 2), hash)
      await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'image')
    }
    await f.add('one', {}, [{ attachmentId: 'sha256:' + exclusive }, { attachmentId: 'sha256:' + shared }])
    await f.add('other', {}, [{ attachmentId: 'sha256:' + shared }])
    const ctl = f.controller(), preview = await ctl.preview('one'), result = await ctl.remove('one', preview.token)
    assert.deepEqual(result.warnings, [])
    await assert.rejects(fs.stat(path.join(f.services.attachments.root, 'objects', 'aa', exclusive)), { code: 'ENOENT' })
    assert.ok(await fs.stat(path.join(f.services.attachments.root, 'objects', 'bb', shared)))
    await assert.rejects(ctl.remove('one', preview.token), /确认/)
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})

test('storage guard rejects traversal and symlinks without deleting target', async () => {
  const { safeFile } = await import('../src/storage.mjs')
  const f = await fixture()
  try {
    const file = await f.add('one')
    await assert.rejects(safeFile(path.dirname(file), path.join(f.root, 'outside')), /之外/)
    await fs.symlink(path.dirname(file), path.join(f.root, 'redirect'), 'junction')
    await assert.rejects(safeFile(f.root, path.join(f.root, 'redirect/session.jsonl')), /符号链接/)
    assert.ok(await fs.stat(file))
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})

test('partial filesystem failure is reported and preserves the parent for retry', async () => {
  const f = await fixture()
  try {
    const parent = await f.add('one'), child = await f.add('task', { origin: 'subagent', parentSession: 'one' })
    f.services.sessionPersistence.coordinator.preparations.assertWritable = id => { if (id === 'one') throw new Error('test file locked') }
    const ctl = f.controller(), preview = await ctl.preview('one'), result = await ctl.remove('one', preview.token)
    assert.equal(result.complete, false)
    assert.deepEqual(result.deletedIds, ['task'])
    assert.match(result.warnings[0], /部分日志/)
    assert.ok(await fs.stat(parent)); await assert.rejects(fs.stat(child), { code: 'ENOENT' })
  } finally { await fs.rm(f.root, { recursive: true, force: true }) }
})

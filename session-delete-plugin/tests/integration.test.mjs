import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Query from '@deepseek-ai/dsh-session-query-sqlite'
import { createDeletionController } from '../lib/delete.mjs'
import { verifyCompatibility, deletionRoute } from '../lib/host.mjs'
import { Readable } from 'node:stream'
const settle = () => new Promise(resolve => setImmediate(resolve))

for (const compression of ['none', 'zstd']) test('real Cordis + ' + compression + ' persistence: disposal drains, deletion persists across restart', async () => {
  verifyCompatibility()
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-delete-real-'))
  const ctx = new Context()
  try {
    ctx.plugin(SessionStore); await settle()
    const persistenceFiber = ctx.plugin(JsonlPersistence, { root: path.join(root, 'logs'), compression })
    await settle()
    assert.equal(persistenceFiber.state, 2, String(persistenceFiber.error))
    const agents = new Map(), handles = new Map()
    ctx.provide('agents', { list: () => [...agents.values()], get: id => agents.get(id) })
    ctx.provide('workspaceRegistry', { list: () => [], enqueueOperation: fn => fn(), requireState: () => ({ archivedSessionIds: [] }), setState: async () => {}, headers: new Map(), sessionPaths: new Map(), invalidSessionPaths: new Map() })
    const owner = ctx.plugin({ inject: ['sessions'], apply(child) {
      const session = child.sessions.create('delete-me', { meta: { cwd: root } })
      session.append('session/title', { title: 'Delete only this test', source: 'user' })
    } })
    await settle()
    const session = ctx.sessions.get('delete-me')
    assert.ok(session, String(owner.error || owner._error))
    const agent = { id: session.id, status: 'idle', session }
    agents.set(session.id, agent)
    handles.set(session.id, { agent, dispose: async () => { await owner.dispose(); agents.delete(session.id) } })
    const ctl = createDeletionController(ctx, handles)
    const preview = await ctl.preview(session.id)
    const file = ctx.sessionPersistence.locate(session.header).path
    assert.ok((await fs.stat(file)).size > 0)
    const result = await ctl.remove(session.id, preview.token)
    assert.equal(result.complete, true)
    assert.deepEqual(result.warnings, [])
    assert.equal(ctx.sessions.get(session.id), undefined)
    assert.deepEqual(await ctx.sessionPersistence.list(), [])
    await assert.rejects(ctx.sessionPersistence.inspect(session.id))
    await assert.rejects(fs.stat(file), { code: 'ENOENT' })
    await persistenceFiber.dispose()
    ctx.plugin(JsonlPersistence, { root: path.join(root, 'logs'), compression }); await settle()
    assert.deepEqual(await ctx.sessionPersistence.list(), [])
  } finally { await ctx.fiber.dispose(); await fs.rm(root, { recursive: true, force: true }) }
})

test('HTTP route rejects cross-site and unconfirmed deletion', async () => {
  const invoke = async (url, headers, body, method = 'POST') => {
    const req = Readable.from([JSON.stringify(body)])
    Object.assign(req, { url, method, headers })
    const res = { writeHead(code) { this.status = code }, end(body) { this.body = JSON.parse(body) } }
    await deletionRoute({ preview: async () => ({ token: 'token' }), remove: async () => { throw new Error('确认已失效') } })(req, res)
    return res
  }
  assert.equal((await invoke('/session-delete/preview', { host: 'localhost:3000', origin: 'https://evil.example', 'content-type': 'application/json' }, {})).status, 403)
  assert.equal((await invoke('/session-delete/confirm', { 'content-type': 'application/json' }, {})).status, 409)
  assert.equal((await invoke('/session-delete/confirm', {}, {}, 'GET')).status, 405)
})

test('SQLite search rows are removed and the on-disk index is compacted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-delete-index-'))
  const ctx = new Context()
  try {
    ctx.plugin(SessionStore); await settle()
    ctx.plugin(JsonlPersistence, { root: path.join(root, 'logs'), compression: 'none' }); await settle()
    const queryFiber = ctx.plugin(Query, { path: path.join(root, 'search.sqlite'), openAt: 'startup' })
    if (queryFiber.inertia) await queryFiber.inertia
    await settle()
    assert.equal(queryFiber.state, 2, String(queryFiber._error))
    ctx.provide('agents', { list: () => [], get: () => undefined })
    ctx.provide('workspaceRegistry', { list: () => [], enqueueOperation: fn => fn(), requireState: () => ({ archivedSessionIds: [] }), setState: async () => {}, headers: new Map(), sessionPaths: new Map(), invalidSessionPaths: new Map() })
    const owner = ctx.plugin({ inject: ['sessions'], apply(child) {
      const s = child.sessions.create('indexed', { meta: { cwd: root } })
      s.append('session/title', { title: 'A test title', source: 'user' })
    } }); await settle()
    await ctx.sessions.flush(ctx.sessions.get('indexed')); await owner.dispose()
    await ctx.sessionPersistence.coordinator.waitForRetirement('indexed')
    await ctx.sessionQuery._serialized(undefined, () => ctx.sessionQuery._reconcile(undefined))
    assert.equal(ctx.sessionQuery._db.prepare('SELECT count(*) AS n FROM persisted_sessions').get().n, 1)
    const ctl = createDeletionController(ctx), preview = await ctl.preview('indexed')
    const result = await ctl.remove('indexed', preview.token)
    assert.deepEqual(result.warnings, [])
    assert.equal(ctx.sessionQuery._db.prepare('SELECT count(*) AS n FROM persisted_sessions').get().n, 0)
    assert.equal(ctx.sessionQuery._db.prepare('PRAGMA freelist_count').get().freelist_count, 0)
  } finally { await ctx.fiber.dispose(); await fs.rm(root, { recursive: true, force: true }) }
})

test('gateway captures the real creation handle and mounts a working delete endpoint', async () => {
  const { default: Gateway } = await import('../lib/host.mjs')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-delete-gateway-')), ctx = new Context()
  const liveAgents = new Map(), routes = new Map()
  try {
    ctx.plugin(SessionStore); await settle()
    ctx.plugin(JsonlPersistence, { root: path.join(root, 'logs'), compression: 'none' }); await settle()
    const services = {
      agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      attachments: {}, directoryPicker: {}, llm: {}, subagents: {}, tools: {}, userQuestions: { registerProvider: () => () => {} },
      sessionQuery: { _serialized() {}, _reconcile() {}, _ensureReady() {} },
      workspaceRegistry: { list: () => [], enqueueOperation: fn => fn(), requireState: () => ({ archivedSessionIds: [] }), setState: async () => {}, headers: new Map(), sessionPaths: new Map(), invalidSessionPaths: new Map() },
      webServer: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path) } },
      agents: {
        list: () => [...liveAgents.values()], get: id => liveAgents.get(id),
        create: async options => {
          const owner = ctx.plugin({ inject: ['sessions'], apply(child) {
            const session = child.sessions.create(options.sessionId, { meta: options.meta })
            session.append('session/title', { title: 'Gateway test', source: 'user' })
            liveAgents.set(session.id, { id: session.id, session, status: 'idle' })
          } }); await settle()
          return { agent: liveAgents.get(options.sessionId), dispose: async () => { await owner.dispose(); liveAgents.delete(options.sessionId) } }
        },
      },
    }
    for (const [name, service] of Object.entries(services)) ctx.provide(name, service)
    const gateway = ctx.plugin(Gateway, {}); await settle()
    assert.equal(gateway.state, 2, String(gateway._error))
    const result = await ctx.apiProxy.sessions.create({ rpcId: 'test', payload: { sessionId: 'gateway-test', cwd: root } })
    assert.equal(result.result.ok, true, JSON.stringify(result))
    const call = async (action, body) => {
      const req = Readable.from([JSON.stringify(body)])
      Object.assign(req, { url: '/session-delete/' + action, method: 'POST', headers: { 'content-type': 'application/json' } })
      const res = { writeHead(code) { this.status = code }, end(text) { this.body = JSON.parse(text) } }
      await routes.get('/session-delete').handler(req, res)
      return res
    }
    const preview = await call('preview', { sessionId: 'gateway-test' })
    assert.equal(preview.status, 200, JSON.stringify(preview.body))
    const removed = await call('confirm', { sessionId: 'gateway-test', token: preview.body.token })
    assert.equal(removed.status, 200, JSON.stringify(removed.body))
    assert.deepEqual(removed.body.deletedIds, ['gateway-test'])
    assert.equal(ctx.sessions.get('gateway-test'), undefined)
    await assert.rejects(ctx.apiProxy.sessions.create({ rpcId: 'retry', payload: { sessionId: 'gateway-test', cwd: root } }), /已永久删除/)
  } finally { await ctx.fiber.dispose(); await fs.rm(root, { recursive: true, force: true }) }
})

test('real DSH patch composition replaces only gateway and workspace UI and retains PaperDock', async () => {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { SESSION_DELETE_PATCH } = await import('../install.mjs')
  const { composeEntries, loadOverlayPatches } = await import('@deepseek-ai/dsh-app-boot')
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-delete-patch-'))
  try {
    const file = path.join(root, 'cordis.patch.yml')
    await fs.writeFile(file, '- insert:\n    - id: paperdock\n      name: paperdock-dsh-plugin\n' + SESSION_DELETE_PATCH)
    const web = path.join(path.dirname(require.resolve('@deepseek-ai/dsh-web-app/package.json')), 'cordis.patch.yml')
    const base = path.join(path.dirname(require.resolve('@deepseek-ai/dsh-base/package.json')), 'cordis.patch.yml')
    const warnings = []
    const entries = composeEntries([loadOverlayPatches('dsh', base), loadOverlayPatches('dsh', web), loadOverlayPatches('dsh', file)], warning => warnings.push(warning))
    const flatten = entries => entries.flatMap(e => [e, ...(Array.isArray(e.config) ? flatten(e.config) : [])])
    const all = flatten(entries)
    assert.equal(all.find(e => e.id === 'api-gateway').disabled, true)
    assert.equal(all.find(e => e.id === 'session-delete').name, 'dsh-session-delete-plugin')
    assert.equal(all.find(e => e.id === 'ui-workspace').disabled, true)
    assert.equal(all.find(e => e.id === 'paperdock').name, 'paperdock-dsh-plugin')
    assert.deepEqual(warnings, [])
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})

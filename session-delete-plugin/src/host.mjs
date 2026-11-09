import { Service } from '@deepseek-ai/cordis'
import { ApiProxyService, createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createDeletionController } from './delete.mjs'

const require = createRequire(import.meta.url)
export function verifyCompatibility() {
  const expected = JSON.parse(readFileSync(new URL('./compat.json', import.meta.url), 'utf8'))
  for (const entry of expected) {
    const root = dirname(require.resolve(entry.package + '/package.json'))
    const hash = createHash('sha256').update(readFileSync(join(root, entry.file))).digest('hex')
    if (hash !== entry.sha256) throw new Error('Session delete: DSH dependency changed; rebuild and reinstall the plugin: ' + entry.package)
  }
}

async function readBody(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (Buffer.byteLength(text) > 8192) throw new Error('请求过大')
  }
  return JSON.parse(text)
}
export function deletionRoute(controller) {
  return async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    if (req.method !== 'POST') return reply(405, { error: '仅支持 POST' })
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, { error: '仅支持 JSON' })
    const origin = req.headers.origin
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && (() => { try { return new URL(origin).host !== req.headers.host } catch { return true } })())) return reply(403, { error: '拒绝跨站请求' })
    try {
      const body = await readBody(req)
      const pathname = req.url.split('?')[0]
      const value = pathname === '/session-delete/preview' ? await controller.preview(body.sessionId)
        : pathname === '/session-delete/confirm' ? await controller.remove(body.sessionId, body.token) : null
      if (!value) return reply(404, { error: '未知接口' })
      reply(200, { ok: true, ...value })
    } catch (error) { reply(409, { ok: false, error: error.message }) }
  }
}

export default class SessionDeleteGateway extends Service {
  static inject = [...ApiProxyService.inject, 'sessionPersistence', 'webServer']
  static Config = ApiProxyService.Config
  constructor(ctx, config) {
    verifyCompatibility()
    super(ctx, 'apiProxy')
    const handles = new Map()
    const controller = createDeletionController(ctx, handles)
    const original = ctx.agents
    const agents = new Proxy(original, {
      get(target, key) {
        if (key === 'create' || key === 'resume') return async options => {
          const id = options.sessionId || options.resumeSessionId
          controller.assertAvailable(id)
          const handle = await target[key](options)
          handles.set(handle.agent.id, handle)
          return handle
        }
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const api = createApiProxy(ctx.extend({ agents }), {
      defaultModelSelection: () => ctx.agentDefaultModel.currentSelection(),
      saveDefaultModelSelection: selection => ctx.agentDefaultModel.saveSelection(selection),
      cwd: process.cwd(),
      ...config.nativeOpen === undefined ? {} : { canOpenPath: () => config.nativeOpen },
      sessionExportCompressionLevel: config.sessionExportCompressionLevel,
      coldBlankProbeMaxBytes: config.coldBlankProbeMaxBytes,
    })
    // Serialize ordinary session API operations with deletion, including lazy resume.
    for (const [key, method] of Object.entries(api.sessions)) {
      if (typeof method !== 'function') continue
      api.sessions[key] = (...args) => controller.serial(() => {
        controller.assertAvailable(args[0]?.payload?.sessionId)
        return method.apply(api.sessions, args)
      })
    }
    for (const key of ['sessions', 'subagents', 'workspace', 'host', 'goals', 'skills', 'agentPresets', 'settings', 'credentials', 'llm', 'events', 'downloads']) this[key] = api[key]
    this.respond = api.respond.bind(api)
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/session-delete', handler: deletionRoute(controller) }), 'session-delete: routes')
    ctx.on('agent/disposed', agent => handles.delete(agent.id))
  }
}

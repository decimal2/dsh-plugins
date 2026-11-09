import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import * as plugin from '../lib/host.js'

let Context
try {
  const specifier = process.env.DSH_CORDIS_PATH ? pathToFileURL(process.env.DSH_CORDIS_PATH).href : '@deepseek-ai/cordis'
  ;({ Context } = await import(specifier))
} catch (error) {
  if (process.env.DSH_CORDIS_PATH || error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('cold start waits for host services, mounts RPC, and remounts after webServer replacement', { skip: !Context && 'Set DSH_CORDIS_PATH to the installed Cordis lib/index.js' }, async () => {
  const ctx = new Context()
  const routes = new Map()
  const webServer = { register(route) {
    assert.equal(routes.has(route.path), false)
    routes.set(route.path, route)
    return () => routes.delete(route.path)
  } }
  const rpc = async method => {
    const res = { status: 0, writeHead(status) { this.status = status }, end(body) { this.body = body } }
    const req = Readable.from([JSON.stringify({ dir: '/workspace' })])
    Object.assign(req, { method: 'POST', url: '/paperdock/rpc/' + method, headers: {} })
    const route = routes.get('/api/paperdock/rpc/' + method)
    if (route) {const result=await route.fetch(new Request('http://localhost/api/paperdock/rpc/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dir:'/workspace'})}));res.writeHead(result.status);res.end(await result.text())}
    else { res.writeHead(405); res.end('') } // Actual static fallback rejects POST.
    return res
  }
  const fiber = ctx.plugin(plugin)
  try {
    await settle()
    ctx.provide('fs', { resolve: async path => ({ displayPath: path }), listDir: async () => [] })
    ctx.provide('shell', {})
    ctx.provide('sandboxPolicy',{resolve:()=>({mode:'workspace-write',workspaceRoot:'/workspace'})})
    ctx.provide('llm', {})
    ctx.provide('agentDefaultModel', {})
    ctx.provide('connection',{fetch:{register:route=>webServer.register(route)}})
    const removeWeb = ctx.provide('webServer', webServer)
    await settle()
    let response = await rpc('list')
    assert.equal(response.status, 200, 'late webServer must register /paperdock instead of falling through to 405')
    assert.deepEqual(JSON.parse(response.body).files, [])
    assert.ok(routes.has('/api/paperdock/media'))
    await removeWeb()
    await settle()
    assert.equal(routes.size, 0, 'service removal must dispose owned routes')
    ctx.provide('webServer', webServer)
    await settle()
    response = await rpc('health')
    assert.equal(response.status, 200)
    assert.equal(JSON.parse(response.body).webServer, true)
  } finally {
    await fiber.dispose()
    await ctx.fiber.dispose()
  }
  assert.equal(routes.size, 0)
})

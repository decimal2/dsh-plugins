import {symbols} from '@deepseek-ai/cordis'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { createDeletionController } from './delete.mjs'
export function verifyCompatibility() {
  const expected = JSON.parse(readFileSync(new URL('./compat.json', import.meta.url), 'utf8'))
  for (const entry of expected) {
    const root = dirname(fileURLToPath(import.meta.resolve(entry.package + '/package.json')))
    const hash = createHash('sha256').update(readFileSync(join(root, entry.file))).digest('hex')
    if (hash !== entry.sha256) throw new Error('Session delete: DSH dependency changed; rebuild and reinstall the plugin: ' + entry.package)
  }
}


export function deletionFetch(controller, action) {
  return async request => {
    const reply = (status, body) => Response.json(body, {status, headers:{'cache-control':'no-store'}})
    if (request.method !== 'POST') return reply(405, {error:'仅支持 POST'})
    if (!request.headers.get('content-type')?.startsWith('application/json')) return reply(415,{error:'仅支持 JSON'})
    try {
      const raw = await request.text()
      if (Buffer.byteLength(raw)>8192) return reply(413,{error:'请求过大'})
      const body=JSON.parse(raw)
      const result = action === 'preview' ? await controller.preview(body.sessionId) : await controller.remove(body.sessionId, body.token)
      return reply(200,{ok:true,...result})
    } catch(error) { return reply(409,{ok:false,error:error.message}) }
  }
}
export const inject=['sessionController','agents','sessions','sessionPersistence','workspaceRegistry','sessionQuery','connection']
export function apply(ctx) {
    verifyCompatibility()
    const handles = new Map()
    const controller = createDeletionController(ctx, handles)
    const native=ctx.sessionController[symbols.original]
    const owner=native.agents
    if(!owner?.ctx || typeof owner.resolveAgent!=='function') throw new Error('Session Controller lifecycle changed')
    const originalContext=owner.ctx
    const original = originalContext.agents
    const agents = new Proxy(original, { get(target,key) {
      if (key === 'create' || key === 'resume') return async (...args) => {
        const options=args[0]
        controller.assertAvailable(typeof options === 'string' ? options : options?.sessionId || options?.resumeSessionId)
        const handle=await target[key](...args)
        if (controller.deleted.has(handle.agent.id)) { await handle.dispose(); controller.assertAvailable(handle.agent.id) }
        handles.set(handle.agent.id, handle)
        return handle
      }
      const value=Reflect.get(target,key)
      return typeof value==='function' ? value.bind(target) : value
    }})
    const ownedContext=originalContext.extend({agents})
    owner.ctx=ownedContext
    ctx.effect(()=>()=>{if(owner.ctx===ownedContext) owner.ctx=originalContext})
    ctx.provide('sessionDeletion',controller)
    for (const key of ['create','prompt','fork','rename','selectModel','initializeDefaultModel','updateQueue']) {
      const method=native[key]
      const wrapped=function(...args){return controller.serial(()=>method.apply(this,args))}
      native[key]=wrapped
      ctx.effect(()=>()=>{if(native[key]===wrapped) native[key]=method})
    }
    for (const action of ['preview','confirm']) ctx.effect(()=>ctx.connection.fetch.register({
      path:'/api/session-delete/'+action, methods:['POST'], requestBody:'buffered', fetch:deletionFetch(controller,action),
    }), 'session-delete: '+action)
    ctx.on('agent/pre-step',(payload,next)=>controller.deleted.has(payload.agent.id)?Promise.resolve({kind:'reject'}):next())
    ctx.inject(['sessionProjectionCache'],scope=>{
      const cache=scope.sessionProjectionCache[symbols.original]
      const originalPut=cache.put
      const guardedPut=function(id,...args){return controller.deleted.has(id)?Promise.resolve():originalPut.call(this,id,...args)}
      cache.put=guardedPut
      scope.effect(()=>()=>{if(cache.put===guardedPut) cache.put=originalPut})
    })
    ctx.on('agent/disposed', ({agent})=>handles.delete(agent.id))
}

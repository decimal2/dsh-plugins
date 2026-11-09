import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {Context,symbols} from '@deepseek-ai/cordis'
import SessionStore,{Session} from '@deepseek-ai/dsh-session'
import Query from '@deepseek-ai/dsh-session-query-sqlite'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import {createDeletionController} from '../lib/delete.mjs'
import {verifyCompatibility,deletionFetch} from '../lib/host.mjs'
for(const compression of ['none','zstd']) test('v2 '+compression+': native persistence deletion and writer lock refusal',async()=>{
 verifyCompatibility()
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-v2-delete-'))
 const ctx=new Context()
 try {
  await ctx.plugin(SessionStore).await()
  const fiber=ctx.plugin(Jsonl,{root,compression,listConcurrency:4});await fiber.await()
  const p=ctx.sessionPersistence
  const header=Session.create('delete-me').header
  const writer=await p.create(header);await writer.flush()
  const agents=new Map(), sessions=new Map()
  ctx.provide('agents',{get:id=>agents.get(id),list:()=>[...agents.values()]})
  await ctx.plugin(Query,{path:path.join(root,'search.sqlite'),openAt:'startup'}).await()
  await ctx.sessionQuery._serialized(undefined,()=>ctx.sessionQuery._reconcile(undefined))
  assert.equal(ctx.sessionQuery._db.prepare('SELECT count(*) AS n FROM persisted_sessions').get().n,1)
  ctx.provide('workspaceRegistry',{list:()=>[],headers:new Map(),sessionPaths:new Map(),invalidSessionPaths:new Map(),enqueueOperation:fn=>fn(),requireState:()=>({archivedSessionIds:[],pinnedSessionIds:[]}),setState:async()=>{}})
  const ctl=createDeletionController(ctx)
  const preview=await ctl.preview(header.id)
  await assert.rejects(ctl.remove(header.id,preview.token))
  assert.ok(await p.stat(header.id),'active writer log must remain')
  await writer.close()
  const location=(await p.stat(header.id)).location
  const historical=path.join(path.dirname(location.path),'session.v1.jsonl'+(compression==='zstd'?'.zstd':''))
  await fs.writeFile(historical,'historical generation must also be removed')
  const confirmed=await ctl.preview(header.id)
  const result=await ctl.remove(header.id,confirmed.token)
  assert.equal(result.complete,true)
  assert.equal(ctx.sessionQuery._db.prepare('SELECT count(*) AS n FROM persisted_sessions').get().n,0)
  assert.equal(ctx.sessionQuery._db.prepare('PRAGMA freelist_count').get().freelist_count,0)
  assert.deepEqual(result.warnings,[])
  assert.equal(await p.stat(header.id),undefined)
  assert.deepEqual(await p.list(),[])
  await assert.rejects(fs.stat(historical),{code:'ENOENT'})
  await assert.rejects(ctl.remove(header.id,confirmed.token))
  for(const [id,meta] of [['parent',{}],['child',{origin:'subagent',parentSession:'parent',delegationDepth:1}],['grandchild',{origin:'subagent',parentSession:'child',delegationDepth:2}],['fork',{parentSession:'parent'}]]) {
    const h=await p.create({...Session.create(id).header,...meta});await h.flush();await h.close()
  }
  const stopActivity=ctx.on('workspace/session-activity',()=>Promise.resolve([{kind:'schedule'}]))
  await assert.rejects(ctl.preview('parent'),/任务/);await stopActivity()
  const stale=await ctl.preview('parent')
  const parentFile=(await p.stat('parent')).location.path
  await fs.utimes(parentFile,new Date(),new Date(Date.now()+5000))
  await assert.rejects(ctl.remove('parent',stale.token),/变化/)
  const family=await ctl.preview('parent');assert.equal(family.sessionCount,3)
  const removed=await ctl.remove('parent',family.token)
  assert.deepEqual(new Set(removed.deletedIds),new Set(['parent','child','grandchild']))
  assert.deepEqual((await p.list()).map(row=>row.header.id),['fork'])

 } finally {await ctx.fiber.dispose();await fs.rm(root,{recursive:true,force:true})}
})
test('v2 endpoint checks method, content type and confirmation',async()=>{
 const route=deletionFetch({remove:async()=>{throw new Error('confirmation required')}},'confirm')
 assert.equal((await route(new Request('http://localhost/api/session-delete/confirm'))).status,405)
 assert.equal((await route(new Request('http://localhost/api/session-delete/confirm',{method:'POST',body:'{}'}))).status,415)
 const res=await route(new Request('http://localhost/api/session-delete/confirm',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}))
 assert.equal(res.status,409)
})

test('v2 native SessionController activates, captures created handles and deletes through authenticated route registration',async()=>{
 const Plugin=await import('../lib/host.mjs')
 const {SessionController}=await import('@deepseek-ai/dsh-api-session-controller')
 const {default:SessionStore}=await import('@deepseek-ai/dsh-session')
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-v2-controller-')),ctx=new Context()
 const live=new Map(),routes=new Map()
 try {
  await ctx.plugin(SessionStore).await()
  await ctx.plugin(Jsonl,{root,compression:'none',listConcurrency:4}).await()
  const noop=()=>()=>{}
  const registry={list:()=>[],headers:new Map(),sessionPaths:new Map(),invalidSessionPaths:new Map(),archivedSessionIds:[],enqueueOperation:fn=>fn(),requireState:()=>({archivedSessionIds:[],pinnedSessionIds:[]}),setState:async()=>{}}
  const services={
   agentDefaultModel:{currentSelection:()=>({provider:'test',model:'test'})},
   attachments:{imageLimits:{}},fileUploads:{registerAgentResolver:noop},fs:{},llm:{},remoteAccess:{allows:()=>true},
   sessionQuery:{_serialized:async()=>{}},typertGateway:{},workspaceRegistry:registry,
   typert:{resources:{register:noop},lookups:{configure:noop},contexts:{configureHost:noop}},
   sessionProjections:{onEventChanged:noop,register:async()=>({stateOf:()=>({blank:true,lastPromptAt:null})}),snapshot:()=>({})},
   connection:{fetch:{register:route=>{routes.set(route.path,route);return ()=>routes.delete(route.path)}}},
   agents:{list:()=>[...live.values()],get:id=>live.get(id),create:async options=>{
     let session
     const owner=ctx.plugin({inject:['sessions'],apply(child){session=child.sessions.create(options.sessionId,{meta:options.meta})}})
     await owner.await()
     const writer=await ctx.sessionPersistence.create(session.header);await writer.flush()
     const agent={id:session.id,status:'idle',session}
     live.set(agent.id,agent)
     return {agent,dispose:async()=>{await writer.close();await owner.dispose();live.delete(agent.id)}}
   }}
  }
  for(const [key,value] of Object.entries(services)) ctx.provide(key,value)
  await ctx.plugin(SessionController,{}).await()
  const native=ctx.sessionController[symbols.original],originalCreate=native.create,originalContext=native.agents.ctx
  const fiber=ctx.plugin(Plugin,{});await fiber.await()
  assert.equal(fiber.state,2,String(fiber.error))
  const result=await ctx.sessionController.create({cwd:root})
  assert.ok(ctx.sessionDeletion.handles.has(result.sessionId))
  const call=async(action,body)=>{
   const route=routes.get('/api/session-delete/'+action)
   assert.deepEqual(route.methods,['POST'])
   const response=await route.fetch(new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}))
   const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value
  }
  const preview=await call('preview',{sessionId:result.sessionId})
  const deleted=await call('confirm',{sessionId:result.sessionId,token:preview.token})
  assert.equal(deleted.complete,true)
  assert.equal(ctx.sessions.get(result.sessionId),undefined)
  await fiber.dispose()
  assert.equal(native.create,originalCreate)
  assert.equal(native.agents.ctx,originalContext)
  assert.equal(routes.has('/api/session-delete/confirm'),false)
 } finally {await ctx.fiber.dispose();await fs.rm(root,{recursive:true,force:true})}
})

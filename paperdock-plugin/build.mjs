// 把 ../pdf-dock-plugin 里留档的两个"函数体"包成真正的 DSH 插件包。
//
// 为什么要生成而不是手抄：那两个函数体（host.js / client.js）是唯一源码真相，
// 它们当初是给 dynamic Cordis Plugin 写的，直接用三个内建（harness / styles / host.call）。
// 真插件没有那三个内建，所以这里给它们各做一个适配层，函数体本身**一字不改**地内联进来。
//
// 用法：node build.mjs  →  产出 lib/host.js 与 lib/client.js
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sourceDir = join(here, 'src')
const libDir = join(here, 'lib')

const PACKAGE_NAME = 'paperdock-dsh-plugin'
const ROUTE_PREFIX = '/paperdock'

const hostBody = readFileSync(join(sourceDir, 'figures.js'), 'utf8').trimEnd() + '\n' +
  readFileSync(join(sourceDir, 'host.js'), 'utf8').trimEnd()
const draftBody=readFileSync(join(sourceDir,'drafts.mjs'),'utf8').replace('export function','function')
const readerBody = draftBody+'\n'+readFileSync(join(sourceDir, 'pdf-reader.js'), 'utf8')
const clientBody = readFileSync(join(sourceDir, 'client.js'), 'utf8').replace('const h = React.createElement', 'const h = React.createElement\n' + readerBody).trimEnd()

/* ------------------------------------------------------------------ host 半 */
// 适配层：把 dynamic 运行期的 harness.handle(method, handler) 变成
// POST /paperdock/rpc/<method> 的 JSON 接口；defineTool/registerTool 留空实现。
const hostPrologue = `/**
 * 自动生成，请勿手改 —— 源文件：paperdock-plugin/src/host.js（改那边，再跑 node build.mjs）
 *
 * 适配层：dynamic 运行期提供的 harness 在这里换成 HTTP RPC。
 *   harness.handle(method, handler)  →  POST ${ROUTE_PREFIX}/rpc/<method>  (JSON in / JSON out)
 * 其余代码与留档版本逐字一致。
 */
import { downloadArxiv } from './arxiv.mjs'
import { createFigureRenderer } from './render-figure.mjs'
import { createRecordStore } from './records.mjs'
import { homedir } from 'node:os'
import { join } from 'node:path'
const recordStore=createRecordStore(join(process.env.DSH_HOME || join(homedir(),'.dsh'),'paperdock','records'))
import { Readable } from 'node:stream'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative as relativePath } from 'node:path'
const renderFigure = createFigureRenderer()
const ROUTE_PREFIX = '${ROUTE_PREFIX}'
const handlers = new Map()

function readJsonBody(req) {
  return new Promise(function (resolve, reject) {
    let raw = ''
    req.on('data', function (chunk) { raw += chunk })
    req.on('end', function () {
      if (raw === '') { resolve(null); return }
      try { resolve(JSON.parse(raw)) } catch (error) { reject(error) }
    })
    req.on('error', reject)
  })
}

const harness = {
  handle: function (method, handler) {
    const key = String(method)
    handlers.set(key, handler)
    return function () { handlers.delete(key) }
  },
  defineTool: function (definition) { return definition },
  registerTool: function () { return function () {} },
}

const plugin = (function () {
${hostBody}
})()

export const name = 'paperdock'
// Cordis must wait for these services on cold boot and rebind on replacement.
export const inject = ['webServer', 'fs', 'shell', 'connection', 'llm', 'agentDefaultModel', 'sandboxPolicy']

export function apply(ctx) {
  const connection=ctx.get('connection')
  if (connection) return applyConnection(ctx,connection)
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(function () {
      return webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async function (req, res) {
          const url = String(req && req.url ? req.url : '')
          const match = /^\\/paperdock\\/rpc\\/([A-Za-z0-9_-]+)/.exec(url)
          const handler = match ? handlers.get(match[1]) : undefined
          if (handler === undefined) {
            res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, error: 'unknown paperdock method: ' + url }))
            return
          }
          try {
            const args = req.method === 'POST' ? await readJsonBody(req) : null
            const value = await handler(args)
            const text = JSON.stringify(value === undefined ? null : value)
            res.writeHead(200, {
              'content-type': 'application/json; charset=utf-8',
              'content-length': String(Buffer.byteLength(text)),
              'cache-control': 'no-store',
            })
            res.end(text)
          } catch (error) {
            const text = JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) })
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(text)
          }
        },
      })
    }, 'paperdock-rpc')
  }
  return plugin.apply(ctx)
}

function mediaUrls(value) {
  if (typeof value === 'string' && value.startsWith('/cordis-pdfdock/')) return '/api/paperdock/media?path='+encodeURIComponent(value)
  if (Array.isArray(value)) return value.map(mediaUrls)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,mediaUrls(item)]))
  return value
}
function applyConnection(ctx,connection) {
  const assets = new URL('./pdfjs/', import.meta.url)
  for (const file of readdirSync(assets, {recursive:true, withFileTypes:true})) {
    if (!file.isFile()) continue
    const fullPath = file.parentPath + '/' + file.name
    const relative = relativePath(fileURLToPath(assets),fullPath).split(String.fromCharCode(92)).join('/')
    // Exact route inventory: requests cannot traverse or expose arbitrary files.
    const name = relative.startsWith('/') ? relative.slice(1) : relative
    const mime = (name.endsWith('.mjs') || name.endsWith('.js')) ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'
    ctx.effect(() => connection.fetch.register({
      path:'/api/paperdock/assets/'+name, methods:['GET'], requestBody:'buffered',
      fetch:() => new Response(readFileSync(fullPath), {headers:{'content-type':mime,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'}})
    }))
  }
  const routes=new Map()
  const webServer={register(route) {routes.set(route.path,route);return ()=>routes.delete(route.path)}}
  const adapted=new Proxy(ctx,{get(target,key) {
    if(key==='get') return name=>name==='webServer'?webServer:target.get(name)
    const value=Reflect.get(target,key)
    return typeof value==='function'?value.bind(target):value
  }})
  plugin.apply(adapted)
  handlers.set('records-read',async args=>({ok:true,record:await recordStore.read(args.path)}))
  handlers.set('records-write',async args=>({ok:true,record:await recordStore.write(args.path,args.record,args.expectedRevision)}))
  handlers.set('records-remove',async args=>{await recordStore.remove(args.path);return {ok:true}})
  handlers.set('records-list',async()=>({ok:true,records:await recordStore.list()}))
  ctx.effect(()=>connection.fetch.register({
    path:'/api/paperdock/translate-stream',methods:['POST'],requestBody:'buffered',
    async fetch(request) {
      const args=await request.json(),abort=new AbortController(),encoder=new TextEncoder()
      let closed=false
      const stream=new ReadableStream({
        start(controller) {
          const send=value=>{if(!closed)controller.enqueue(encoder.encode(JSON.stringify(value)+'\\n'))}
          const cancel=()=>abort.abort()
          request.signal.addEventListener('abort',cancel,{once:true})
          if(request.signal.aborted)abort.abort()
          Promise.resolve(handlers.get('translate')(args,{signal:abort.signal,delta:text=>send({type:'delta',text})}))
            .then(result=>send({type:'result',result}),error=>send({type:'result',result:{ok:false,error:error.message}}))
            .finally(()=>{request.signal.removeEventListener('abort',cancel);if(!closed){closed=true;controller.close()}})
        },
        cancel(){closed=true;abort.abort()}
      })
      return new Response(stream,{headers:{'content-type':'application/x-ndjson','cache-control':'no-store'}})
    }
  }))
  for(const [method,handler] of handlers) ctx.effect(()=>connection.fetch.register({
    path:'/api/paperdock/rpc/'+method,methods:['POST'],requestBody:'buffered',
    async fetch(request) {
      try {return Response.json(mediaUrls(await handler(await request.json())),{headers:{'cache-control':'no-store'}})}
      catch(error) {return Response.json({ok:false,error:error.message},{status:500})}
    }
  }),'paperdock: '+method)
  ctx.effect(()=>connection.fetch.register({
    path:'/api/paperdock/media',methods:['GET','HEAD'],requestBody:'buffered',
    async fetch(request) {
      const pathname=new URL(request.url).searchParams.get('path') || ''
      if(!pathname.startsWith('/cordis-pdfdock/')) return new Response('not found',{status:404})
      const req=Readable.from([])
      Object.assign(req,{url:pathname,method:request.method,headers:Object.fromEntries(request.headers)})
      let status=200,headers={},body
      const res={writeHead(code,fields){status=code;headers=fields || {}},end(value){body=value}}
      const route=routes.get('/cordis-pdfdock')
      if(!route) return new Response('not ready',{status:503})
      await route.handler(req,res)
      return new Response(request.method==='HEAD'?null:body,{status,headers})
    }
  }),'paperdock: media')
}
`

/* ---------------------------------------------------------------- client 半 */
// 适配层：真插件没有 React / styles / host 三个内建，用 module loader 给回来：
//   require('react')            → 共享的 React 实例
//   styles.insert(css)          → 自己的 <style> 标签（随插件卸载可清）
//   host.call(method, args)     → fetch 上面的 POST /paperdock/rpc/<method>
const clientWrapper = `/**
 * 自动生成，请勿手改 —— 源文件：paperdock-plugin/src/client.js（改那边，再跑 node build.mjs）
 *
 * Client 插件以 DSH 的 module-loader bundle 形式交付：导出 apply/inject，
 * 内部用 require() 取共享 React，用 fetch 调 Host 的 HTTP RPC。
 */
window.__ModuleLoader__.load({
  id: '${PACKAGE_NAME}',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var reactNs = require('react')
    var React = reactNs && reactNs.createElement ? reactNs : (reactNs.default || reactNs)

    var styles = {
      insert: function (css) {
        var tag = document.createElement('style')
        tag.dataset.plugin = '${PACKAGE_NAME}'
        tag.textContent = css
        document.head.appendChild(tag)
        return function () {
          if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
        }
      },
    }

    var host = {
      call: async function (method, args) {
        var response = await fetch('/api/paperdock/rpc/' + encodeURIComponent(String(method)), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(args === undefined ? null : args),
        })
        var text = await response.text()
        if (!response.ok) {
          throw new Error('paperdock rpc ' + method + ' → HTTP ' + response.status + ' ' + text)
        }
        return text === '' ? null : JSON.parse(text)
      },
    }

    var plugin = (function () {
${clientBody}
    })()

    exports.name = plugin.name || 'paperdock'
    exports.apply = plugin.apply
    exports.inject = plugin.inject || []
    return module.exports
  },
})
`

mkdirSync(libDir, { recursive: true })
writeFileSync(join(libDir,'arxiv.mjs'),readFileSync(join(sourceDir,'arxiv.mjs')))
writeFileSync(join(libDir,'records.mjs'),readFileSync(join(here,'src','records.mjs')))
cpSync(join(here, 'vendor', 'pdfjs'), join(libDir, 'pdfjs'), {recursive:true})
writeFileSync(join(libDir, 'render-figure.mjs'), readFileSync(join(sourceDir, 'render-figure.mjs')))
writeFileSync(join(libDir, 'host.js'), hostPrologue, 'utf8')
writeFileSync(join(libDir, 'client.js'), clientWrapper, 'utf8')
console.log('wrote lib/host.js   (' + hostPrologue.split('\n').length + ' lines)')
console.log('wrote lib/client.js (' + clientWrapper.split('\n').length + ' lines)')

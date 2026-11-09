import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createFigureRenderer } from '../src/render-figure.mjs'
const run = promisify(execFile)
const sample = resolve(import.meta.dirname, '../../../paper_pdfs/REINFORCE-Zero.pdf')
const sources = await Promise.all(['figures.js', 'host.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')))

async function harness(built = false, shellOverride, llmOverride, downloadOverride) {
  const methods = new Map(), routes = []
  let currentVersion = 'v1'
  const fs = {
    resolve: async path => ({ displayPath: path }), processPath: target => target.displayPath,
    stat: async target => ({ type: 'file', size: (await stat(target.displayPath)).size, version: currentVersion }),
    readBytes: async target => readFile(target.displayPath),
  }
  const shell = shellOverride || {
    resolve: spec => spec,
    execute: async spec => ({ result: async () => {
      // The production shell handles quoting; this adapter runs the same Poppler args directly.
      const args = spec.command.match(/"[^"]*"|\S+/g).map(s => s.replace(/^"|"$/g, ''))
      const { stdout, stderr } = await run(args.shift(), args, { maxBuffer: 24 * 1024 * 1024 })
      return { exitCode: 0, stdout: { text: stdout }, stderr: { text: stderr } }
    } }),
  }
  const connection = {fetch:{register:route=>{routes.push(route);return ()=>{}}}}
  const services = {llm:llmOverride,agentDefaultModel:{currentSelection:()=>({provider:"test",model:"test"})}, ...(built ? {connection} : {}), fs, shell, sandboxPolicy:{resolve:()=>({mode:'workspace-write',workspaceRoot:resolve(import.meta.dirname,'../../..'),networkAccess:false})}, webServer: { register: route => { routes.push(route); return () => {} } } }
  const plugin = built ? await import('../lib/host.js') : new Function('harness', 'renderFigure', 'downloadArxiv', sources.join('\n'))({ handle: (name, fn) => methods.set(name, fn) }, createFigureRenderer(), downloadOverride)
  plugin.apply({ get: name => services[name], effect: fn => fn() })
  return { methods, routes, setVersion: v => { currentVersion = v }, async request(url, payload) {
    const exact=routes.find(route=>route.path===url.split('?')[0] && route.fetch)
    if(exact) {
      const response=await exact.fetch(new Request('http://localhost'+url,{method:payload===undefined?'GET':'POST',...(payload===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(payload)})}))
      return {status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())}
    }
    const res = { status: 0, headers: {}, writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
    const { Readable } = await import('node:stream')
    const req = Readable.from(payload === undefined ? [] : [JSON.stringify(payload)])
    Object.assign(req, { url, headers: {}, method: payload === undefined ? 'GET' : 'POST' })
    await routes.find(route => url.startsWith(route.path)).handler(req, res)
    return res
  } }
}

test('sample opens with 15 inline crops and serves original vector plots as PNG', async () => {
  const h = await harness()
  const opened = await h.methods.get('open')({ path: sample })
  assert.equal(opened.ok, true, opened.error)
  const { doc } = opened
  assert.equal(doc.pages.flat().filter(b => b.k === 'image').length, 15)
  assert.match(doc.pages[7].find(b => b.k === 'image').sourceText, /REINFORCE/)
  const blocks = doc.pages[1]
  const imageIndex = blocks.findIndex(b => b.k === 'image')
  assert.ok(imageIndex >= 0)
  assert.match(blocks[imageIndex + 1].t, /^Figure 1:/)
  assert.ok(blocks.some(b => /Our contributions/.test(b.t)))
  assert.equal(doc.pages[19].filter(b => b.k === 'image').length, 0, 'prose reference is not a caption')
  const response = await h.request(blocks[imageIndex].url)
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'image/png')
  assert.equal(response.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.ok(response.body.readUInt32BE(16) > 900)
  assert.ok(response.body.readUInt32BE(20) > 350)
  const reopened = await h.methods.get('open')({ path: sample })
  const newURL = reopened.doc.pages[1].find(b => b.k === 'image').url
  assert.notEqual(newURL, blocks[imageIndex].url, 'cached layout must get fresh document URLs')
  assert.equal((await h.request('/cordis-pdfdock/figure/missing/1/0.png')).status, 404)
  assert.equal((await h.request(`/cordis-pdfdock/figure/${doc.docId}/2/999.png`)).status, 404)
  assert.equal((await h.request(`/cordis-pdfdock/figure/${doc.docId}/0/0.png`)).status, 404)
  h.setVersion('v2')
  assert.equal((await h.request(blocks[imageIndex].url)).status, 409)
})

test('embedded bitmap and vector graphic both get inline images, including paths with spaces', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { fixturePDF } = await import('./fixture.mjs')
  const dir = await mkdtemp(resolve(tmpdir(), 'paperdock-test-'))
  try {
    const path = resolve(dir, 'vector & bitmap.pdf')
    await writeFile(path, fixturePDF())
    const h = await harness()
    const opened = await h.methods.get('open')({ path })
    assert.equal(opened.ok, true, opened.error)
    const images = opened.doc.pages[0].filter(b => b.k === 'image')
    assert.equal(images.length, 2)
    for (const image of images) {
      const response = await h.request(image.url)
      assert.equal(response.status, 200)
      assert.equal(response.body.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    }
    const text = opened.doc.pages[0].map(b => b.t).join(' ')
    assert.match(text, /Body paragraph before/)
    assert.match(text, /Body paragraph after/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('built package exposes open RPC and serves its inline figure URL', async () => {
  const h = await harness(true)
  const response = await h.request('/api/paperdock/rpc/open', { path: sample })
  assert.equal(response.status, 200)
  const opened = JSON.parse(response.body)
  assert.equal(opened.ok, true, opened.error)
  const image = opened.doc.pages[1].find(b => b.k === 'image')
  assert.ok(image)
  assert.equal((await h.request(image.url)).status, 200)
})

const dshDir=process.env.DSH_INSTALL_DIR || (process.platform==='win32' ? resolve(process.env.APPDATA,'npm/node_modules/@deepseek-ai/dsh') : undefined)
test('built PaperDock opens PDF with the actual installed DSH shell executor', {skip:!dshDir && 'Set DSH_INSTALL_DIR for the native executor integration'}, async()=>{
  const {createRequire}=await import('node:module')
  const {pathToFileURL}=await import('node:url')
  const require=createRequire(resolve(dshDir,'package.json'))
  const load=name=>import(pathToFileURL(require.resolve('@deepseek-ai/'+name)).href)
  const {Context}=await load('cordis')
  const {default:Subprocess}=await load('dsh-subprocess-local')
  const {default:Shell}=await load(process.platform==='win32'?'dsh-pwsh-local':'dsh-bash-local')
  const ctx=new Context()
  const {mkdtemp,copyFile,rm}=await import('node:fs/promises')
  const {tmpdir}=await import('node:os')
  const folder=await mkdtemp(resolve(tmpdir(),'paperdock-native-'))
  const pdf=resolve(folder,'paper with spaces.pdf')
  await copyFile(sample,pdf)
  try {
    await ctx.plugin(Subprocess).await()
    await ctx.plugin(Shell,{}).await()
    assert.equal(typeof ctx.shell.run,'undefined','test must not provide the obsolete API')
    let executions=0
    const h=await harness(true,{resolve:spec=>ctx.shell.resolve(spec),execute:async spec=>{executions++;return ctx.shell.execute(spec)}})
    const response=await h.request('/api/paperdock/rpc/open',{path:pdf})
    const opened=JSON.parse(response.body)
    assert.equal(opened.ok,true,opened.error)
    assert.ok(executions>=2,'must actually execute Poppler, not reuse the layout cache')
    assert.equal(opened.doc.pages.length,20)
    assert.equal(opened.doc.pages.flat().filter(block=>block.k==='image').length,15)
  } finally {await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})

test('PDF extraction requests read-only policy and retains the complete sandbox failure',async()=>{
  const specs=[]
  const detail='sandbox backend unavailable. '+ 'description '.repeat(40)+'Runner failure: windows-acl-run: ERROR_ACCESS_DENIED (5)'
  const h=await harness(false,{resolve:spec=>{specs.push(spec);return spec},execute:async()=>{throw new Error(detail)}})
  const result=await h.methods.get('open')({path:sample})
  assert.equal(result.ok,false)
  assert.ok(specs.length>0)
  assert.ok(specs.every(spec=>spec.sandboxPolicy?.mode==='read-only'))
  assert.ok(specs.every(spec=>spec.sandboxPolicy?.networkAccess===false))
  assert.match(result.error,/Runner failure: windows-acl-run: ERROR_ACCESS_DENIED \(5\)/)
})

test('actual sandbox executor receives read-only policy and propagates runner refusal without bypass', {skip:!dshDir && 'Set DSH_INSTALL_DIR'}, async()=>{
  const {createRequire}=await import('node:module')
  const {pathToFileURL}=await import('node:url')
  const require=createRequire(resolve(dshDir,'package.json'))
  const load=name=>import(pathToFileURL(require.resolve('@deepseek-ai/'+name)).href)
  const {Context}=await load('cordis')
  const {default:Subprocess}=await load('dsh-subprocess-local')
  const {default:Shell}=await load(process.platform==='win32'?'dsh-pwsh-sandbox':'dsh-bash-sandbox')
  const {SandboxUnavailableError}=await load('dsh-sandbox')
  const ctx=new Context(),policies=[]
  try {
    await ctx.plugin(Subprocess).await()
    ctx.provide('sandboxPolicy',{defaultMode:'workspace-write',resolve:()=>({mode:'workspace-write',workspaceRoot:process.cwd()})})
    ctx.provide('sandbox',{confine:async(_argv,policy)=>{policies.push(policy);throw new SandboxUnavailableError(policy.mode,'windows-acl-run: test backend refused')}})
    await ctx.plugin(Shell,{}).await()
    const h=await harness(false,ctx.shell)
    const result=await h.methods.get('open')({path:sample})
    assert.equal(result.ok,false)
    assert.ok(policies.length>0)
    assert.ok(policies.every(p=>p.mode==='read-only'))
    assert.match(result.error,/Runner failure: windows-acl-run: test backend refused/)
  } finally {await ctx.fiber.dispose()}
})

test('bundled PDF.js assets are served locally with module MIME', async () => {
  const h = await harness(true)
  const response = await h.request('/api/paperdock/assets/build/pdf.mjs')
  assert.equal(response.status,200)
  assert.match(response.headers['content-type'],/javascript/)
  assert.match(response.body.toString(),/getDocument/)
  const worker = await h.request('/api/paperdock/assets/build/pdf.worker.mjs')
  assert.equal(worker.status,200)
})

 test('translation delivers deltas before completion and cancellation reaches the model',async()=>{
 let finish,signal
 const gate=new Promise(resolve=>finish=resolve)
 const llm={async *stream(options){signal=options.signal;yield {type:'text-delta',text:'第一段'};await gate;yield {type:'text-delta',text:'第二段'};yield {type:'finish',reason:'stop'}}}
 const h=await harness(true,undefined,llm)
 const route=h.routes.find(route=>route.path==='/api/paperdock/translate-stream')
 const response=await route.fetch(new Request('http://localhost/api/paperdock/translate-stream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'source',kind:'translate'})}))
 const reader=response.body.getReader()
 const first=await reader.read()
 assert.deepEqual(JSON.parse(new TextDecoder().decode(first.value)),{type:'delta',text:'第一段'})
 assert.equal(signal.aborted,false)
 await reader.cancel()
 assert.equal(signal.aborted,true)
 finish()
 })


test('arXiv open downloads then runs the existing PDF extraction and propagates download failure', async()=>{
 const downloads=[]
 const h=await harness(false,undefined,undefined,async url=>{downloads.push(url);if(url.includes('00000'))throw new Error('arXiv HTTP 404');return sample})
 const opened=await h.methods.get('open')({path:'https://arxiv.org/abs/1706.03762'})
 assert.equal(opened.ok,true,opened.error)
 assert.equal(opened.doc.pageCount,20)
 assert.deepEqual(downloads,['https://arxiv.org/abs/1706.03762'])
 const failed=await h.methods.get('open')({path:'https://arxiv.org/abs/1706.00000'})
 assert.equal(failed.ok,false)
 assert.match(failed.error,/404/)
})

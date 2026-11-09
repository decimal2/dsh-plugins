import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArxivLink, downloadArxiv } from '../src/arxiv.mjs'
const pdf = '%PDF-1.7\nfixture\n%%EOF'
async function workspace(fn) {
 const root = await mkdtemp(join(tmpdir(),'paperdock-arxiv-'))
 try { await fn(root) } finally { await rm(root,{recursive:true,force:true}) }
}
test('arXiv abstract, PDF, versioned and historical links normalize to safe PDF names',()=>{
 for(const url of ['https://arxiv.org/abs/1706.03762','https://arxiv.org/pdf/1706.03762.pdf?download=1','https://arxiv.org/html/1706.03762']) assert.equal(parseArxivLink(url).url,'https://arxiv.org/pdf/1706.03762')
 assert.equal(parseArxivLink('https://arxiv.org/abs/1706.03762v2').filename,'arxiv-1706.03762v2.pdf')
 assert.equal(parseArxivLink('https://arxiv.org/pdf/hep-th/9901001').filename,'arxiv-hep-th-9901001.pdf')
 for(const url of ['https://evil.test/abs/1706.03762','https://arxiv.org.evil.test/pdf/1706.03762','https://x@arxiv.org/pdf/1706.03762','https://arxiv.org/pdf/../../etc/passwd','https://arxiv.org/abs/1713.03762']) assert.throws(()=>parseArxivLink(url))
})
test('downloads once, reuses local PDF and deduplicates simultaneous requests',()=>workspace(async root=>{
 let calls=0
 const fetchImpl=async()=>{calls++;return new Response(pdf)}
 const [one,two]=await Promise.all([downloadArxiv('https://arxiv.org/abs/1706.03762',root,{fetchImpl}),downloadArxiv('https://arxiv.org/pdf/1706.03762',root,{fetchImpl})])
 assert.equal(one,two);assert.equal(calls,1);assert.equal(await readFile(one,'utf8'),pdf)
 await downloadArxiv('https://arxiv.org/abs/1706.03762',root,{fetchImpl});assert.equal(calls,1)
 assert.deepEqual(await readdir(join(root,'paper_pdfs')),['arxiv-1706.03762.pdf'])
}))
test('HTML, oversized, HTTP failure and broken streams leave no partial files',()=>workspace(async root=>{
 const responses=[()=>new Response('<html>blocked</html>'),()=>new Response(pdf),()=>new Response('',{status:429}),()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('%PDF-'));c.error(new Error('disconnected'))}}))]
 for(let i=0;i<responses.length;i++){
  await assert.rejects(downloadArxiv('https://arxiv.org/abs/1706.03762',root,{fetchImpl:async()=>responses[i](),maxBytes:i===1?8:1024}))
  assert.deepEqual(await readdir(join(root,'paper_pdfs')),[])
 }
}))
test('redirects cannot download from a different host',()=>workspace(async root=>{
 let calls=0
 await assert.rejects(downloadArxiv('https://arxiv.org/abs/1706.03762',root,{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.org/private'}})}}),/仅支持/)
 assert.equal(calls,1)
}))
test('failed download retries successfully and never overwrites an existing invalid file',()=>workspace(async root=>{
 const url='https://arxiv.org/abs/1706.03762'
 await assert.rejects(downloadArxiv(url,root,{fetchImpl:async()=>{throw new Error('offline')}}),/offline/)
 const path=await downloadArxiv(url,root,{fetchImpl:async()=>new Response(pdf)})
 await writeFile(path,'user data')
 await assert.rejects(downloadArxiv(url,root,{fetchImpl:async()=>{throw new Error('must not fetch')}}),/不是 PDF/)
 assert.equal(await readFile(path,'utf8'),'user data')
}))
test('missing workspace prevents a network request',async()=>{
 await assert.rejects(downloadArxiv('https://arxiv.org/abs/1706.03762','',{fetchImpl:()=>{throw new Error('must not fetch')}}),/工作区/)
})

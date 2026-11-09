import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {cleanAttachments,safeFile} from '../lib/storage.mjs'
test('v2 removes exclusive images, generic file objects and hardlink aliases, preserving shared attachments',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dsh-v2-files-'))
 const exclusive='a'.repeat(64),shared='b'.repeat(64)
 try {
  for(const hash of [exclusive,shared]) {
   for(const type of ['objects','file-objects']) {
    const file=path.join(root,type,hash.slice(0,2),hash)
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'data')
   }
   const dir=path.join(root,'files',hash.slice(0,2),hash)
   await fs.mkdir(dir,{recursive:true})
   await fs.link(path.join(root,'file-objects',hash.slice(0,2),hash),path.join(dir,'paper.pdf'))
  }
  const services={attachments:{root},agents:{list:()=>[]},sessions:{list:()=>[]},sessionPersistence:{list:async()=>[{header:{id:'keep'}}],open:async()=>({read:async()=>({events:[{attachmentId:'sha256:'+shared}]}),close:async()=>{}})}}
  const result=await cleanAttachments({get:key=>services[key]},new Set([exclusive,shared]),['deleted'])
  assert.deepEqual(result.warnings,[])
  for(const type of ['objects','file-objects']) {
   await assert.rejects(fs.stat(path.join(root,type,'aa',exclusive)),{code:'ENOENT'})
   assert.ok(await fs.stat(path.join(root,type,'bb',shared)))
  }
  await assert.rejects(fs.stat(path.join(root,'files','aa',exclusive,'paper.pdf')),{code:'ENOENT'})
  assert.ok(await fs.stat(path.join(root,'files','bb',shared,'paper.pdf')))
  const elsewhere=path.join(root,'real');await fs.mkdir(elsewhere);await fs.writeFile(path.join(elsewhere,'keep'),'keep')
  await fs.symlink(elsewhere,path.join(root,'link'),'junction')
  await assert.rejects(safeFile(root,path.join(root,'link','keep')),/符号链接/)
 } finally {await fs.rm(root,{recursive:true,force:true})}
})

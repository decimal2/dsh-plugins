import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRecordStore} from '../src/records.mjs'
test('reading records survive reload, separate documents, and can be permanently removed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paperdock-records-'))
 try{
  const store=createRecordStore(dir)
  await store.write('E:\\论文\\a.pdf',{page:7,zoom:'fit',items:[{id:'1',output:'译文'}]})
  await store.write('E:\\论文\\b.pdf',{page:2,zoom:'1',items:[]})
  const restored=createRecordStore(dir)
  assert.equal((await restored.read('E:\\论文\\a.pdf')).page,7)
  assert.equal((await restored.list()).length,2)
  await restored.remove('E:\\论文\\a.pdf')
  assert.equal(await restored.read('E:\\论文\\a.pdf'),null)
  assert.equal((await restored.read('E:\\论文\\b.pdf')).page,2)
  assert.equal((await readdir(dir)).length,1)
  await assert.rejects(()=>store.write('../escape',{page:-1,items:[]}),/page/)
 }finally{await rm(dir,{recursive:true,force:true})}
})

test('stale tabs cannot overwrite changes or recreate a deleted record',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paperdock-conflict-'))
 try{
  const store=createRecordStore(dir),initial=await store.write('a.pdf',{page:1,items:[]})
  const changed=await store.write('a.pdf',{page:2,items:[],marks:[{text:'new'}]},initial.revision)
  await assert.rejects(()=>store.write('a.pdf',{page:3,items:[]},initial.revision),/其他标签/)
  assert.equal((await store.read('a.pdf')).page,2)
  await store.remove('a.pdf')
  await assert.rejects(()=>store.write('a.pdf',{page:3,items:[]},changed.revision),/其他标签/)
  assert.equal(await store.read('a.pdf'),null)
 }finally{await rm(dir,{recursive:true,force:true})}
})

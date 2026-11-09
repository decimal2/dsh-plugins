import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createDraftJournal} from '../src/drafts.mjs'
test('uncommitted reading draft survives reload and independent tabs do not erase one another',()=>{
 const map=new Map(),storage={setItem:(k,v)=>map.set(k,v),getItem:k=>map.get(k),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],get length(){return map.size}}
 const a=createDraftJournal(storage)
 a.write('tab1','a.pdf',{page:2,paperNote:'未提交笔记'},'rev1')
 a.write('tab2','a.pdf',{page:3},'rev1')
 const reloaded=createDraftJournal(storage)
 assert.equal(reloaded.list('a.pdf').length,2)
 assert.equal(reloaded.list('b.pdf').length,0)
 reloaded.remove('tab2')
 assert.equal(reloaded.list('a.pdf')[0].record.paperNote,'未提交笔记')
})

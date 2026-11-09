import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
const built=await fs.readFile(new URL('../lib/client.js',import.meta.url),'utf8')
const code=(await fs.readFile(new URL('../src/v2/client.js',import.meta.url),'utf8')).replace('__NATIVE_SESSION_CLIENT__','({apply(){}})').replace("'session-delete-danger'",JSON.stringify(built.match(/deleteAction:'([^']+)'/)?.[1] || built.match(/deleteAction:"([^"]+)"/)[1]))
function fixture(handler) {
 let plugin,menu,Dialog
 const calls=[],updates=[]
 const jsx=(type,props)=>({type,props})
 const modules={react:{useSyncExternalStore:(_s,get)=>get()},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'@deepseek-ai/dsh-client-ui-primitives':{Modal:'Native.Modal',Button:'Native.Button'}}
 const runtime={plugin:()=>{},inject:(_keys,fn)=>fn(runtime),effect:fn=>fn(),contextMenus:{register:value=>{menu=value;return ()=>{}}},slots:{inject:(_name,fn)=>fn(),register:(_spec,value)=>{Dialog=value;return ()=>{}}},sessions:{refresh:async()=>updates.push('refresh')},uiWorkspace:{mainReference:{sessionId:'one'},clearMain:()=>updates.push('clear')}}
 vm.runInNewContext(code,{window:{__ModuleLoader__:{load:({factory})=>{plugin=factory(name=>modules[name])}}},fetch:async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)})
  if(handler) return handler(url,options)
  return {ok:true,json:async()=>({ok:true,token:'token',bytes:1234,sessionCount:2,deletedIds:['one'],complete:true,warnings:[]})}
 }})
 plugin.apply(runtime)
 return {calls,updates,open:()=>menu.resolve({sessionId:'one',displayTitle:'test'})[0].run(),dialog:()=>Dialog()}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
test('v2 uses native menu contribution, Modal, Button and native danger CSS; cancel never deletes',async()=>{
 const f=fixture();f.open();await settle()
 const dialog=f.dialog();assert.equal(dialog.type,'Native.Modal');assert.equal(dialog.props.open,true)
 const [cancel,confirm]=dialog.props.footer.props.children
 assert.equal(confirm.type,'Native.Button');assert.match(confirm.props.className,/deleteAction/)
 assert.equal(f.calls[0].url,'/api/session-delete/preview')
 cancel.props.onClick();assert.equal(f.dialog().props.open,false);assert.equal(f.calls.length,1)
 assert.doesNotMatch(code,/window\.(confirm|alert)/)
 assert.doesNotMatch(code,/function WorkspaceBrowser/)
})
test('v2 confirms once, blocks close while deleting and clears deleted selection',async()=>{
 const f=fixture();f.open();await settle()
 const confirm=f.dialog().props.footer.props.children[1]
 const pending=confirm.props.onClick();f.dialog().props.onClose();confirm.props.onClick()
 assert.equal(f.dialog().props.open,true)
 await pending
 assert.equal(f.calls.length,2);assert.equal(f.calls[1].body.token,'token')
 assert.deepEqual(f.updates,['clear','refresh']);assert.equal(f.dialog().props.open,false)
})
test('v2 canceled preview cannot reopen native dialog',async()=>{
 let resolve
 const f=fixture(()=>new Promise(done=>{resolve=done}));f.open();f.dialog().props.onClose()
 resolve({ok:true,json:async()=>({ok:true,token:'late'})});await settle()
 assert.equal(f.dialog().props.open,false);assert.equal(f.calls.length,1)
})

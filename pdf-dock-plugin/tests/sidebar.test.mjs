import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function mount(call=async()=>({ok:true}), sessions={}) {
  const types = new Map(), seats = new Map(), cleanups = []
  let css = ''
  const plugin = new Function('React', 'styles', 'host', readFileSync(new URL('../../paperdock-plugin/src/client.js', import.meta.url), 'utf8').replace('const h = React.createElement', 'const h = React.createElement\n'+readFileSync(new URL('../../paperdock-plugin/src/pdf-reader.js',import.meta.url),'utf8')))(
    {createElement:(type,props,...children)=>({type,props,children}),useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value}),useEffect:()=>{}}, {insert:value=>{css=value;return ()=>{css=''}}}, {call})
  const slots = {
    inject: (name, callback) => callback(),
    register: (definition, component) => {seats.set(definition.name,{definition,component});return ()=>seats.delete(definition.name)},
  }
  const tabs = {register:definition=>{types.set(definition.id,definition);return ()=>types.delete(definition.id)}}
  plugin.apply({get:name=>({slots,sidebarRightTabs:tabs,sidebarRight:{},sessions}[name]),effect:fn=>{const off=fn();if(typeof off==='function')cleanups.push(off)}})
  return {plugin,types,seats,get css(){return css},dispose(){for(const off of cleanups.reverse())off()}}
}

test('PaperDock owns a native sidebar guide entry and body, with no conversation tab or composer override',()=>{
  const app=mount()
  assert.ok(app.plugin.inject.includes('sidebarRightTabs'))
  const type=app.types.get('paperdock-reader')
  assert.equal(type.kind,'paperdock')
  assert.equal(type.multiple,true)
  assert.equal(type.guide[0].title(),'PaperDock')
  assert.equal(app.seats.get('sidebar.right.pane.tab').definition.key,'paperdock-reader')
  assert.equal(app.seats.has('conversation.view'),false)
  assert.equal(app.css.includes('[data-composer-seat]'),false)
  app.dispose()
  assert.equal(app.types.size,0)
  assert.equal(app.seats.size,0)
  assert.equal(app.css,'')
})

 test('each sidebar tab gets an independent reader state closure',()=>{
 const app=mount(),tab=app.seats.get('sidebar.right.pane.tab').component
 const first=tab(),second=tab()
 assert.notEqual(first.type,second.type)
 const one=first.type(),two=second.type()
 function input(tree){if(!tree||typeof tree!=='object')return null;if(tree.type==='input'&&tree.props?.placeholder?.includes('PDF 绝对'))return tree;for(const child of tree.children?.flat(Infinity)||[]){const found=input(child);if(found)return found}return null}
 input(one).props.onChange({target:{value:'E:/first.pdf'}})
 assert.equal(input(first.type()).props.value,'E:/first.pdf')
 assert.equal(input(second.type()).props.value,'')
 app.dispose()
 })

test('a failed record read never writes empty records over saved notes',async()=>{
 const calls=[]
 const app=mount(async(method,args)=>{
  calls.push(method)
  if(method==='open')return {ok:true,doc:{path:'a.pdf',pageCount:1,pages:[[]],name:'a.pdf',rawUrl:'test'}}
  if(method==='records-read')return {ok:false,error:'Temporary failure'}
  return {ok:true}
 })
 const Reader=app.seats.get('sidebar.right.pane.tab').component().type
 function walk(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of tree.children?.flat(Infinity)||[]){const found=walk(child,predicate);if(found)return found}return null}
 let tree=Reader()
 walk(tree,item=>item.type==='input'&&item.props?.placeholder?.includes('PDF 绝对')).props.onChange({target:{value:'a.pdf'}})
 tree=Reader()
 walk(tree,item=>item.type==='button'&&item.children[0]==='打开').props.onClick()
 await new Promise(resolve=>setTimeout(resolve,30))
 assert.ok(calls.includes('records-read'))
 assert.equal(calls.includes('records-write'),false)
 app.dispose()
})


test('selection translation sends its quote to the owning native session without a second composer',async()=>{
 const sent=[]
 const app=mount(async method=>method==='open'?{ok:true,doc:{path:'a.pdf',name:'a.pdf',pageCount:1,pages:[[]],rawUrl:'test'}}:{ok:true,record:{revision:'test-revision'}},
 {scope:id=>({get:name=>name==='conversation'?{send:async text=>sent.push({id,text})}:null})})
 const seat=app.seats.get('sidebar.right.pane.tab')
 const Reader=seat.component(seat.definition.inject('session-A')).type
 function find(tree,predicate){if(!tree||typeof tree!=='object')return null;if(predicate(tree))return tree;for(const child of tree.children?.flat(Infinity)||[]){const found=find(child,predicate);if(found)return found}return null}
 const button=(tree,label)=>find(tree,n=>n.type==='button'&&n.children[0]===label)
 let tree=Reader()
 find(tree,n=>n.type==='input'&&n.props?.placeholder?.includes('PDF 绝对')).props.onChange({target:{value:'a.pdf'}})
 button(Reader(),'打开').props.onClick()
 await new Promise(resolve=>setTimeout(resolve,30))
 tree=Reader()
 assert.equal(button(tree,'翻译本页'),null)
 assert.equal(find(tree,n=>n.props?.className==='pdt-composer'),null)
 const pdf=find(tree,n=>typeof n.type==='function'&&n.type.name==='PdfReader')
 assert.equal(pdf.props.toolsOpen,false)
 const node={nodeType:1,closest:()=>({getAttribute:()=> '1',getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})})}
 const range={startContainer:node,endContainer:node,cloneRange(){return this},getBoundingClientRect:()=>({left:10,top:100,right:80,bottom:120,width:70,height:20}),getClientRects:()=>[]}
 const container={contains:n=>n===node,ownerDocument:{defaultView:{innerWidth:1000,innerHeight:800},getSelection:()=>({rangeCount:1,isCollapsed:false,anchorNode:node,toString:()=> 'Selected paper text',getRangeAt:()=>range})}}
 pdf.props.onSelection({currentTarget:container})
 button(Reader(),'翻译').props.onClick()
 await new Promise(resolve=>setTimeout(resolve,0))
 assert.equal(sent.length,1)
 assert.equal(sent[0].id,'session-A')
 assert.match(sent[0].text,/Selected paper text/)
 assert.match(sent[0].text,/页码：1/)
 assert.equal(find(Reader(),n=>n.props?.className==='pdt-right'),null)
 app.dispose()
})

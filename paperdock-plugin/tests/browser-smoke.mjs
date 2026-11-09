import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
import {createRequire} from 'node:module'
import {dirname,resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
const require=createRequire(import.meta.url)
const root=resolve(import.meta.dirname,'../../..')
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{height:100%;margin:0;background:#171717;color:#ddd}#root{height:850px;width:600px;--dsw-alias-bg-base:#171717;--dsw-alias-label-primary:#ddd;--dsw-alias-label-secondary:#bbb;--dsw-alias-border-l1:#555}</style></head><body><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>
window.__ModuleLoader__={load({factory}){
 const plugin=factory(()=>React);const seats={};const slots={inject:(name,fn)=>fn(),register:(def,component)=>{seats[def.name]={component,props:def.inject?.('test-session')};return ()=>{}}};
 plugin.apply({get:name=>({slots,sessions:{scope:()=>({get:()=>({send:async text=>{window.sentText=text}})})},sidebarRight:{},sidebarRightTabs:{register:()=>()=>{}}}[name]),effect:fn=>fn()});
 const seat=seats['sidebar.right.pane.tab'];ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(seat.component,seat.props));
}};</script><script src="/client.js"></script></body></html>`
const records=new Map()
const server=createServer(async(req,res)=>{
 try{
 const pathname=new URL(req.url,'http://localhost').pathname
 if(pathname.startsWith('/api/paperdock/rpc/')){
  let data='';for await(const part of req)data+=part;const args=JSON.parse(data||'{}'),method=pathname.split('/').pop()
  let result={ok:true}
  if(method==='list')result={ok:true,files:[],root:'/papers'}
  if(method==='open')result={ok:true,doc:{docId:'test',name:'sample.pdf',path:args.path,pageCount:20,pages:Array.from({length:20},()=>[{k:'p',t:'Test paper text'}]),mode:'layout',rawUrl:'/sample.pdf'}}
  if(method==='records-read')result.record=records.get(args.path)||null
  if(method==='records-write'){result.record={...args.record,revision:'test-revision'};records.set(args.path,result.record)}
  if(method==='translate')result.text='测试译文'
  res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return
 }
 let data,type='text/javascript'
 if(pathname==='/'){data=html;type='text/html'}
 else if(pathname==='/react.js')data=await readFile(join(dirname(require.resolve('react/package.json')),'umd/react.development.js'))
 else if(pathname==='/react-dom.js')data=await readFile(join(dirname(require.resolve('react-dom/package.json')),'umd/react-dom.development.js'))
 else if(pathname==='/client.js')data=await readFile(root+'/plugins/paperdock-plugin/lib/client.js')
 else if(pathname==='/sample.pdf'){data=await readFile(root+'/paper_pdfs/REINFORCE-Zero.pdf');type='application/pdf'}
 else if(pathname.startsWith('/api/paperdock/assets/')){data=await readFile(root+'/plugins/paperdock-plugin/lib/pdfjs/'+pathname.slice('/api/paperdock/assets/'.length));if(pathname.endsWith('.wasm'))type='application/wasm'}
 else{res.writeHead(404);res.end();return}
 res.setHeader('content-type',type);res.end(data)
 }catch(error){res.writeHead(500);res.end(error.message)}
})

let browser
try{
 browser=await chromium.launch({headless:true,...(process.env.PAPERDOCK_CHROMIUM?{executablePath:process.env.PAPERDOCK_CHROMIUM}:{}),args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:1100,height:900}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://paperdock.test/**',async route=>{
 const request=route.request();let body,headers={},status=200
 const req={url:new URL(request.url()).pathname,async *[Symbol.asyncIterator](){yield request.postData()||''}}
 const res={setHeader:(key,value)=>headers[key]=value,writeHead:code=>status=code,end:value=>body=value}
 await server.listeners('request')[0](req,res)
 await route.fulfill({status,headers,body})
 })
 await page.goto('http://paperdock.test/')
 await page.getByPlaceholder('PDF 绝对路径、工作区相对路径或 arXiv 链接').fill('/sample.pdf')
 await page.getByRole('button',{name:'打开',exact:true}).click()
 await page.locator('.textLayer span').first().waitFor({timeout:30000})
 console.log('text spans',await page.locator('.textLayer span').count())
 await page.getByTitle('下一页').click()
 await page.locator('[data-pdfpage="2"] .textLayer span').first().waitFor()
 await page.getByRole('button',{name:'更多',exact:true}).click()
 await page.getByRole('button',{name:'目录',exact:true}).click()
 await page.getByLabel('PDF 缩放').selectOption('1.25')
 await page.waitForTimeout(600)
 await page.screenshot({path:join(tmpdir(),'paperdock-reader.png')})
 console.log('errors',errors)
 console.log('records',Array.from(records.values()).map(value=>({page:value.page,zoom:value.zoom})))
 if(errors.length)throw new Error(errors.join('\n'))
}finally{await browser?.close();server.close()}

// Text-layer styles derived from Mozilla PDF.js (Apache-2.0); see vendor/pdfjs/LICENSE.
const PDF_READER_CSS = ".pdk-pdf-page .textLayer{\n  --csstools-color-scheme--light:initial;\n  color-scheme:only light;\n\n  position:absolute;\n  text-align:initial;\n  inset:0;\n  overflow:clip;\n  opacity:1;\n  line-height:1;\n  -webkit-text-size-adjust:none;\n     -moz-text-size-adjust:none;\n          text-size-adjust:none;\n  forced-color-adjust:none;\n  transform-origin:0 0;\n  caret-color:CanvasText;\n  z-index:0;\n}\n\n.pdk-pdf-page .textLayer.highlighting{\n    touch-action:none;\n  }\n\n.pdk-pdf-page .textLayer :is(span,br){\n    color:transparent;\n    position:absolute;\n    white-space:pre;\n    cursor:text;\n    transform-origin:0% 0%;\n  }\n\n.pdk-pdf-page .textLayer{\n  --min-font-size:1;\n  --text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));\n  --min-font-size-inv:calc(1 / var(--min-font-size));\n}\n\n.pdk-pdf-page .textLayer  > :not(.markedContent),.pdk-pdf-page .textLayer .markedContent span:not(.markedContent){\n    z-index:1;\n\n    --font-height:0;\n    font-size:calc(var(--text-scale-factor) * var(--font-height));\n\n    --scale-x:1;\n    --rotate:0deg;\n    transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));\n  }\n\n.pdk-pdf-page .textLayer .markedContent{\n    display:contents;\n  }\n\n.pdk-pdf-page .textLayer span[role=\"img\"]{\n    -webkit-user-select:none;\n       -moz-user-select:none;\n            user-select:none;\n    cursor:default;\n  }\n\n.pdk-pdf-page .textLayer .highlight{\n    --highlight-bg-color:rgb(180 0 170 / 0.25);\n    --highlight-selected-bg-color:rgb(0 100 0 / 0.25);\n    --highlight-backdrop-filter:none;\n    --highlight-selected-backdrop-filter:none;\n  }\n\n@media screen and (forced-colors: active){\n\n.pdk-pdf-page .textLayer .highlight{\n      --highlight-bg-color:transparent;\n      --highlight-selected-bg-color:transparent;\n      --highlight-backdrop-filter:var(--hcm-highlight-filter);\n      --highlight-selected-backdrop-filter:var(\n        --hcm-highlight-selected-filter\n      );\n  }\n    }\n\n.pdk-pdf-page .textLayer .highlight{\n\n    margin:-1px;\n    padding:1px;\n    background-color:var(--highlight-bg-color);\n    -webkit-backdrop-filter:var(--highlight-backdrop-filter);\n            backdrop-filter:var(--highlight-backdrop-filter);\n    border-radius:4px;\n  }\n\n.appended:is(.pdk-pdf-page .textLayer .highlight){\n      position:initial;\n    }\n\n.begin:is(.pdk-pdf-page .textLayer .highlight){\n      border-radius:4px 0 0 4px;\n    }\n\n.end:is(.pdk-pdf-page .textLayer .highlight){\n      border-radius:0 4px 4px 0;\n    }\n\n.middle:is(.pdk-pdf-page .textLayer .highlight){\n      border-radius:0;\n    }\n\n.selected:is(.pdk-pdf-page .textLayer .highlight){\n      background-color:var(--highlight-selected-bg-color);\n      -webkit-backdrop-filter:var(--highlight-selected-backdrop-filter);\n              backdrop-filter:var(--highlight-selected-backdrop-filter);\n    }\n\n.pdk-pdf-page .textLayer ::-moz-selection{\n    background:rgba(0 0 255 / 0.25);\n    background:color-mix(in srgb, AccentColor, transparent 75%);\n  }\n\n.pdk-pdf-page .textLayer ::selection{\n    background:rgba(0 0 255 / 0.25);\n    background:color-mix(in srgb, AccentColor, transparent 75%);\n  }\n\n.pdk-pdf-page .textLayer br::-moz-selection{\n    background:transparent;\n  }\n\n.pdk-pdf-page .textLayer br::selection{\n    background:transparent;\n  }\n\n.pdk-pdf-page .textLayer .endOfContent{\n    display:block;\n    position:absolute;\n    inset:100% 0 0;\n    z-index:0;\n    cursor:default;\n    -webkit-user-select:none;\n       -moz-user-select:none;\n            user-select:none;\n  }\n\n.pdk-pdf-page .textLayer.selecting .endOfContent{\n    top:0;\n  }\n\n\n.pdk-pdf-reader{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}\n.pdk-pdf-tools{display:flex;gap:5px;padding:6px;flex-wrap:wrap}.pdk-pdf-tools input{width:80px}\n.pdk-pdf-body{display:flex;flex:1;min-height:0}.pdk-pdf-viewport{flex:1;min-width:0;overflow:auto;padding:12px;background:#525659}\n.pdk-pdf-page{position:relative;background:white;margin:0 auto 12px;--user-unit:1;--total-scale-factor:calc(var(--scale-factor) * var(--user-unit));color-scheme:light}\n.pdk-pdf-page canvas{display:block}.pdk-pdf-outline{flex:0 0 130px;overflow:auto;padding:6px;font-size:12px}\n.pdk-thumbnail{display:block;width:100%;background:transparent;color:inherit;border:0;cursor:pointer;margin-bottom:10px}\n.pdk-search-results{max-height:110px;overflow:auto;flex-shrink:0}.pdk-search-results button{white-space:normal}\n"
/** Independent PDF.js reader. Assets are served locally by the authenticated host. */
const PDF_ASSETS = '/api/paperdock/assets/'
let pdfLibrary
function loadPdfLibrary() {
  if (!pdfLibrary) pdfLibrary = import(PDF_ASSETS + 'build/pdf.mjs').then(lib => {
    lib.GlobalWorkerOptions.workerSrc = PDF_ASSETS + 'build/pdf.worker.mjs'
    return lib
  }).catch(error => { pdfLibrary = null; throw error })
  return pdfLibrary
}
function PdfSurface({ pdf, page, scale, onError, thumbnail = false, marks = [], onDestination }) {
  const canvasRef = React.useRef(null)
  const textRef = React.useRef(null)
  const [links,setLinks]=React.useState([])
  const [size, setSize] = React.useState({width: 1, height: 1})
  React.useEffect(() => {
    let stopped = false, rendering, layer
    void (async () => {
      const lib = await loadPdfLibrary()
      const source = await pdf.getPage(page)
      if (stopped) return
      const viewport = source.getViewport({scale})
      setSize({width: viewport.width, height: viewport.height})
      const canvas = canvasRef.current
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2)
      canvas.width = Math.ceil(viewport.width * ratio)
      canvas.height = Math.ceil(viewport.height * ratio)
      rendering = source.render({canvasContext:canvas.getContext('2d'), viewport, transform:[ratio,0,0,ratio,0,0]})
      await rendering.promise
      if (stopped || thumbnail) return
      const text = await source.getTextContent()
      if (stopped) return
      textRef.current.replaceChildren()
      layer = new lib.TextLayer({textContentSource:text, container:textRef.current, viewport})
      await layer.render()
      const annotations=await source.getAnnotations()
      if(!stopped)setLinks(annotations.filter(item=>item.subtype==='Link').map(item=>{
        const rect=viewport.convertToViewportRectangle(item.rect)
        return {...item,box:{left:Math.min(rect[0],rect[2]),top:Math.min(rect[1],rect[3]),width:Math.abs(rect[2]-rect[0]),height:Math.abs(rect[3]-rect[1])}}
      }))
    })().catch(error => { if (!stopped && error.name !== 'RenderingCancelledException') onError(error.message) })
    return () => {stopped = true; rendering?.cancel(); layer?.cancel()}
  }, [pdf,page,scale,thumbnail])
  return h('div', {className:'pdk-pdf-page', 'data-pdfpage':page, style:{...size, '--scale-factor':scale}},
    h('canvas',{ref:canvasRef,style:size}),
    !thumbnail && h('div',{className:'pdk-marks',style:{position:'absolute',inset:0,pointerEvents:'none'}},marks.filter(mark=>mark.page===page).flatMap(mark=>(mark.rects || []).map((rect,index)=>h('span',{key:mark.id+'-'+index,style:{position:'absolute',left:rect.x*100+'%',top:rect.y*100+'%',width:rect.w*100+'%',height:rect.h*100+'%',background:'rgba(255,210,0,.35)'}})))),
    !thumbnail && h('div',{ref:textRef,className:'textLayer'}),
    !thumbnail && links.map((link,index)=>h('a',{key:index,href:/^(https?:|mailto:)/i.test(link.url || '')?link.url:undefined,target:link.url?'_blank':undefined,rel:'noopener noreferrer','aria-label':link.url || '跳转至引用',style:{position:'absolute',...link.box,zIndex:3},onClick:event=>{if(link.dest){event.preventDefault();onDestination?.(link.dest)}}})))
}
function PdfReader({toolsOpen = false,url,page,onPage,onSelection,onError,zoom,onZoom,marks}) {
  const [pdf,setPdf] = React.useState(null)
  const [outline,setOutline] = React.useState([])
  const [navigation,setNavigation] = React.useState('')
  const [query,setQuery] = React.useState('')
  const [matches,setMatches] = React.useState([])
  const [searching,setSearching] = React.useState(false)
  const [width,setWidth] = React.useState(500)
  const [baseWidth,setBaseWidth] = React.useState(612)
  const viewport = React.useRef(null)
  const searchRun = React.useRef(0)
  React.useEffect(() => {
    const element = viewport.current
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    let stopped=false, task
    setPdf(null); setOutline([]); setMatches([]);setSearching(false); searchRun.current++
    void (async () => {
      const lib=await loadPdfLibrary()
      if(stopped)return
      task=lib.getDocument({url,cMapUrl:PDF_ASSETS+'cmaps/',cMapPacked:true,standardFontDataUrl:PDF_ASSETS+'standard_fonts/',wasmUrl:PDF_ASSETS+'wasm/'})
      const document=await task.promise
      if(stopped)return
      setPdf(document)
      const first=await document.getPage(1)
      if(stopped)return
      setBaseWidth(first.getViewport({scale:1}).width)
      const entries=await document.getOutline()
      if(!stopped)setOutline(entries || [])
    })().catch(error=>{if(!stopped)onError('PDF 打开失败：'+error.message)})
    return ()=>{stopped=true;searchRun.current++;void task?.destroy()}
  },[url])
  async function jump(dest) {
    try {
      const target=typeof dest==='string'?await pdf.getDestination(dest):dest
      if(!Array.isArray(target))return
      const number=typeof target[0]==='number'?target[0]:await pdf.getPageIndex(target[0])
      onPage(number+1)
    } catch(error){onError(error.message)}
  }
  async function search() {
    if(!pdf)return
    const run=++searchRun.current, needle=query.trim().toLocaleLowerCase()
    setMatches([])
    if(!needle){setSearching(false);return}
    setSearching(true)
    try {
      const found=[]
      for(let n=1;n<=pdf.numPages;n++) {
        const source=await pdf.getPage(n), content=await source.getTextContent()
        if(run!==searchRun.current)return
        const text=content.items.map(item=>item.str || '').join(' ')
        const index=text.toLocaleLowerCase().indexOf(needle)
        if(index!==-1)found.push({page:n,text:text.slice(Math.max(0,index-35),index+needle.length+65)})
      }
      setMatches(found)
      if(found.length)onPage(found[0].page)
    }catch(error){if(run===searchRun.current)onError(error.message)}
    finally {if(run===searchRun.current)setSearching(false)}
  }
  function outlineRows(items,level=0) {
    return items.flatMap((item,index)=>[
      h('button',{key:level+'-'+index+'-'+item.title,className:'pdk-file',style:{paddingLeft:8+level*12},onClick:()=>void jump(item.dest)},item.title),
      ...outlineRows(item.items || [],level+1)])
  }
  const actualScale=zoom==='fit'?Math.max(.15,(width-28)/baseWidth):Number(zoom)
  return h('div',{className:'pdk-pdf-reader'},
    toolsOpen && h('div',{className:'pdk-pdf-tools'},
      h('button',{className:'pdk-btn',onClick:()=>setNavigation(navigation==='outline'?'':'outline')},'目录'),
      h('button',{className:'pdk-btn',onClick:()=>setNavigation(navigation==='thumbs'?'':'thumbs')},'缩略图'),
      h('select',{value:zoom,onChange:e=>onZoom(e.target.value),'aria-label':'PDF 缩放'},
        ['fit','0.5','0.75','1','1.25','1.5','2'].map(value=>h('option',{key:value,value},value==='fit'?'适合宽度':Number(value)*100+'%'))),
      h('input',{className:'pdk-input',placeholder:'搜索 PDF',value:query,onChange:e=>setQuery(e.target.value),onKeyDown:e=>{if(e.key==='Enter')void search()}}),
      h('button',{className:'pdk-btn',disabled:!pdf||searching,onClick:()=>void search()},searching?'搜索中…':'查找')),
    matches.length>0 && h('div',{className:'pdk-search-results'},matches.map(item=>h('button',{key:item.page,className:'pdk-file',onClick:()=>onPage(item.page)},'第 '+item.page+' 页 · '+item.text))),
    h('div',{className:'pdk-pdf-body'},
      navigation && h('div',{className:'pdk-pdf-outline'},navigation==='outline'?(outline.length?outlineRows(outline):'此 PDF 没有目录'):
        pdf && Array.from({length:pdf.numPages},(_,i)=>h('button',{key:i,className:'pdk-thumbnail',onClick:()=>onPage(i+1)},
          // Render previews on demand rather than opening hundreds of page renderers.
          Math.abs(i+1-page)<=2?h(PdfSurface,{pdf,page:i+1,scale:.18,thumbnail:true,onError}):null,
          '第 '+(i+1)+' 页'))),
      h('div',{className:'pdk-pdf-viewport',ref:viewport,onMouseUp:onSelection,onKeyUp:onSelection},
        pdf?h(PdfSurface,{key:page,pdf,page,scale:actualScale,onError,marks,onDestination:jump}):h('div',{className:'pdk-blank'},'正在加载 PDF…'))))
}

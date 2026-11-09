/** PaperDock: independent native right-sidebar PDF reading and translation. */

const h = React.createElement

const CSS = [
  '.pdk-btn{height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}',
  '.pdk-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
  '.pdk-btn.is-on{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
  '.pdk-btn.is-on:hover{color:#fff}',
  '.pdk-btn[disabled]{opacity:.45;cursor:not-allowed}',
  '.pdk-btn.pdk-sq{width:26px;padding:0;justify-content:center}',
  '.pdk-seg{display:flex;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden}',
  '.pdk-seg .pdk-btn{border:0;border-radius:0;height:24px;padding:0 8px}',
  '.pdk-label{font-size:11px;color:var(--dsw-alias-label-tertiary);line-height:16px}',
  '.pdk-row{display:flex;gap:6px;align-items:center}',
  '.pdk-input{flex:1 1 auto;min-width:0;height:28px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font:inherit;font-size:12px;outline:none}',
  '.pdk-input:focus{border-color:var(--dsw-alias-brand-primary)}',
  '.pdk-filename{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.pdk-blank{padding:10px 16px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.pdk-hint{flex:0 0 auto;display:flex;align-items:flex-start;gap:6px;margin:0 12px 8px;padding:6px 8px;border-radius:8px;font-size:12px;line-height:17px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}',
  '.pdk-hint.is-error{color:var(--dsw-alias-state-error-primary)}',
  '.pdk-hint-text{flex:1 1 auto;min-width:0;word-break:break-word}',
  '.pdk-pick{padding:4px 12px 12px;display:flex;flex-direction:column;gap:8px}',
  '.pdk-files{display:flex;flex-direction:column;gap:2px;margin-top:2px}',
  '.pdk-file{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;min-width:0}',
  '.pdk-file:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l1)}',
  '.pdk-page{margin:0 12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
  '.pdk-pagehead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px 4px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}',
  '.pdk-pagehead .pdk-btn{height:20px;padding:0 6px;font-size:11px;border-color:transparent}',
  '.pdk-text{padding:8px 16px 6px;font-family:ui-serif,Georgia,"Times New Roman","Songti SC","Noto Serif CJK SC",serif;color:var(--dsw-alias-label-primary);user-select:text}',
  '.pdk-p{margin:0 0 10px;font-size:14.5px;line-height:1.78;word-break:break-word;text-align:justify}',
  '.pdk-p:last-child{margin-bottom:2px}',
  '.pdk-h{margin:16px 0 8px;font-size:14.5px;line-height:1.6;font-weight:600;word-break:break-word}',
  '.pdk-h:first-child{margin-top:2px}',
  '.pdk-cap{margin:0 0 10px;font-size:12.5px;line-height:1.65;color:var(--dsw-alias-label-secondary);border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px}',
  '.pdk-fig{margin:0 0 8px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
  '.pdk-fig summary{cursor:pointer;outline:none;user-select:none}',
  '.pdk-figbody{margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);word-break:break-word}',
  '.pdk-image{margin:8px 0 12px;user-select:none}',
  '.pdk-image a{display:block;cursor:zoom-in}',
  '.pdk-image img{display:block;width:100%;height:auto;background:#fff;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;box-sizing:border-box}',
  '.pdk-image figcaption{margin-top:4px;font:11px/1.5 system-ui;color:var(--dsw-alias-label-tertiary)}',
  '.pdk-image-error{padding:12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:6px;font:12px/1.7 system-ui}',
  '.pdk-raw{flex:1 1 auto;min-height:0;display:flex;padding:0;overflow:hidden}',
  '.pdk-frame{flex:1 1 auto;width:100%;height:100%;border:0;background:#fff;display:block}',
  '.pdk-nav{display:flex;align-items:center;gap:6px;padding:6px 12px;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}',
  '.pdk-nav .pdk-btn{height:22px;padding:0 7px;font-size:11px}',
  '.pdk-pageinput{width:46px;height:22px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;text-align:center;outline:none;padding:0 2px}',
  '.pdk-pageinput:focus{border-color:var(--dsw-alias-brand-primary)}',
  /* ---- 划词气泡：贴着选区，fixed 定位，不受栏宽裁剪 ---- */
  '.pdt-pop{position:fixed;z-index:60;display:flex;align-items:center;gap:4px;padding:5px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 10px 28px rgba(0,0,0,.24)}',
  '.pdt-pop .pdk-btn{height:24px;font-size:12px}',
  '.pdt-popcount{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding:0 4px;max-width:96px;overflow:hidden;text-overflow:ellipsis}',
  '.pdt-popsep{width:1px;height:16px;background:var(--dsw-alias-border-l1);margin:0 2px}',
  '.pdt-root{container-type:inline-size;display:flex;height:100%;min-height:0;flex:1 1 auto;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
  '.pdt-left,.pdt-right{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}',
  '.pdt-left{border-right:1px solid var(--dsw-alias-border-l2)}',
  '.pdt-divider{flex:0 0 auto;width:6px;cursor:col-resize;background:transparent;position:relative}',
  '.pdt-divider:hover{background:var(--dsw-alias-border-l1)}',
  '.pdt-bar{display:flex;align-items:center;gap:6px;padding:4px 8px;flex:0 0 auto;border-bottom:1px solid var(--dsw-alias-border-l2);min-height:32px}',
  '.pdt-bar .pdk-btn{height:24px;font-size:11.5px}',
  '.pdt-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;position:relative;padding:10px 0 16px}',
  '.pdt-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
  '.pdt-count{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
  '.pdt-itemhead{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}',
  '.pdt-itemhead .pdk-btn{height:20px;padding:0 6px;font-size:11px;border-color:transparent}',
  '.pdt-itemmeta{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.pdt-out{padding:10px 14px;font-size:14px;line-height:1.8;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}',
  '.pdt-src{margin:0 10px 8px;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}',
  '.pdt-src summary{cursor:pointer;outline:none;user-select:none}',
  '.pdt-srcbody{margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word}',
  '.pdt-pending{display:flex;align-items:center;gap:8px;padding:12px 14px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}',
  '.pdt-q{align-self:flex-end;margin:0 12px 10px;padding:6px 10px;border-radius:12px 12px 4px 12px;background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary);word-break:break-word}',
  '.pdt-item{display:flex;flex-direction:column;margin:0 12px 14px}',
  '.pdt-bubble{border:1px solid var(--dsw-alias-border-l1);border-radius:12px 12px 12px 4px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
  '.pdt-composer{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:8px 12px 10px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base)}',
  '.pdt-composerctx{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.pdt-card{display:flex;flex-direction:column;gap:6px;padding:8px 10px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}',
  '.pdt-card:focus-within{border-color:var(--dsw-alias-border-l2)}',
  '.pdt-textarea{width:100%;box-sizing:border-box;min-height:42px;max-height:176px;resize:none;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13.5px;line-height:1.7;padding:2px 2px 0;display:block}',
  '.pdt-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}',
  '.pdt-cardfoot{display:flex;align-items:center;gap:6px}',
  '.pdt-cardhint{flex:1 1 auto;min-width:0;font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.pdt-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-brand-primary);animation:pdt-pulse 1s ease-in-out infinite}',
  '@keyframes pdt-pulse{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}',
  '.pdt-root{flex-direction:column;flex-wrap:nowrap}.pdt-left{width:100%!important;flex:1 1 auto!important;min-height:120px;border-right:0}.pdt-right{width:100%;max-height:45%;flex:0 1 45%!important;border-top:1px solid var(--dsw-alias-border-l1)}.pdt-divider{display:none}.pdt-bar{flex-wrap:wrap}.pdt-pending{flex-wrap:wrap}.pdt-pending .pdt-out{width:100%}',
  '.pdt-empty{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:1.9}',
].join('')

const POP_WIDTH = 336
const POP_HEIGHT = 38

function clampText(text, max) {
  const value = String(text === null || text === undefined ? '' : text)
  return value.length > max ? value.slice(0, max) : value
}

function shortName(name, max) {
  const value = String(name || '')
  if (value.length <= max) return value
  return value.slice(0, Math.max(1, max - 1)) + '…'
}

function formatSize(bytes) {
  const size = Number(bytes) || 0
  if (size <= 0) return ''
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + ' KB'
  return (size / (1024 * 1024)).toFixed(1) + ' MB'
}

/** 把选区矩形换算成气泡的视口坐标：优先下方，放不下就翻到上方，水平夹在视口内。 */
function popPosition(rect, view) {
  const viewWidth = view && view.innerWidth ? view.innerWidth : 1440
  const viewHeight = view && view.innerHeight ? view.innerHeight : 900
  let left = rect.left + rect.width / 2 - POP_WIDTH / 2
  left = Math.min(Math.max(8, left), Math.max(8, viewWidth - POP_WIDTH - 8))
  let top = rect.bottom + 8
  if (top + POP_HEIGHT > viewHeight - 8) {
    top = rect.top - POP_HEIGHT - 8
  }
  if (top < 8) top = Math.min(rect.bottom + 8, viewHeight - POP_HEIGHT - 8)
  return { top: Math.round(top), left: Math.round(left) }
}

return {
  inject: ['slots', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'conversation'],
  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) {
      console.error('[PaperDock] slots 服务不可用，无法挂载界面')
      return
    }
    ctx.effect(() => styles.insert(CSS))
    ctx.effect(() => styles.insert(PDF_READER_CSS))

    function createReader(sendToConversation) {
    /** 活着的 Range：滚动时用它重新定位气泡（不放进 state，避免被当成数据序列化） */
    let activeRange = null
    let openSequence = 0
    let saveTimer
    let restoring = false
    const requests = new Map()
    const recordContexts=new Map()
    let saveChain=Promise.resolve()
    const draftId=globalThis.crypto?.randomUUID?.() || 'tab-'+Date.now()+'-'+Math.random()
    let journal
    try{if(globalThis.localStorage)journal=createDraftJournal(globalThis.localStorage)}catch{}

    const listeners = new Set()
    const state = {
      split: 0.5,
      docsLoaded: false,
      docsLoading: false,
      docs: [],
      root: '',
      pickerOpen: false,
      doc: null,
      mode: 'raw',
      zoom: 'fit',
      page: 1,
      pageInput: '1',
      busy: false,
      error: '',
      hint: '',
      pathDraft: '',
      sel: null,
      selPos: { top: 0, left: 0 },
      items: [],
      model: '',
      askDraft: '',
      askScope: 'document',
      marks: [],
      paperNote: '',
      panel: 'translation',
      panelOpen: false,
      toolsOpen: false,
      sendingToChat: false,
      recent: [],
      deletePath: '',
      recovery: null,
      viewHeight: 0,
    }

    function emit() {
      listeners.forEach(function (listener) {
        try {
          listener()
        } catch (error) {
          console.error('[PaperDock] 订阅者异常', error)
        }
      })
    }

    function snapshotRecord(){return {version:state.doc?.version,page:state.page,zoom:state.zoom,marks:state.marks,paperNote:state.paperNote,items:state.items.map(item=>item.status==='pending'?{...item,status:'error',error:'上次生成未完成，请重试'}:item)}}
    function stageDraft(){
      if(!state.doc || restoring || !recordContexts.get(state.doc.path)?.writable)return
      try{journal?.write(draftId,state.doc.path,snapshotRecord(),recordContexts.get(state.doc.path).revision)}
      catch{state.error='浏览器草稿保存失败，请等待远端保存完成再关闭页面'}
    }
    function saveRecord() {
      clearTimeout(saveTimer)
      if(!state.doc || restoring)return
      const path=state.doc.path,context=recordContexts.get(path)
      if(!context?.writable)return
      const record=snapshotRecord()
      saveChain=saveChain.catch(()=>{}).then(async()=>{
        if(!context.writable)return
        const result=await callHost('records-write',{path,record,expectedRevision:context.revision})
        if(result?.ok){context.revision=result.record.revision;if(context.recoveredDraft){journal?.remove(context.recoveredDraft);context.recoveredDraft=null}if(state.doc?.path===path){if(JSON.stringify(snapshotRecord())===JSON.stringify(record))journal?.remove(draftId);else stageDraft()}}
        else{context.writable=false;if(state.doc?.path===path){state.error='阅读记录保存失败，已停止自动覆盖，请导出当前内容后重新打开：'+(result?.error || '未知错误');emit()}}
      })
    }
    function set(patch) {
      for (const key in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) state[key] = patch[key]
      }
      emit()
      if(state.doc && !restoring && ['page','zoom','items','marks','paperNote'].some(key=>key in patch)){stageDraft();clearTimeout(saveTimer);saveTimer=setTimeout(saveRecord,350)}
    }

    function useSync() {
      const pair = React.useState(0)
      const bump = pair[1]
      React.useEffect(function () {
        const listener = function () {
          bump(function (value) {
            return value + 1
          })
        }
        listeners.add(listener)
        return function () {
          listeners.delete(listener)
        }
      }, [])
      return state
    }

    async function callHost(method, args) {
      try {
        return await host.call(method, args === undefined ? null : args)
      } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) }
      }
    }

    let listInFlight = false
    let itemSeq = 0

    async function loadList(dir) {
      if (listInFlight) return
      listInFlight = true
      set({ docsLoading: true })
      const [result,recent] = await Promise.all([callHost('list', dir ? { dir: dir } : {}),callHost('records-list')])
      if(recent?.ok)set({recent:recent.records || []})
      listInFlight = false
      if (result && result.ok === true) {
        set({
          docsLoading: false,
          docsLoaded: true,
          docs: Array.isArray(result.files) ? result.files : [],
          root: typeof result.root === 'string' ? result.root : '',
          error: '',
        })
      } else {
        set({
          docsLoading: false,
          docsLoaded: true,
          docs: [],
          error: (result && result.error) || '无法列出工作区里的 PDF',
        })
      }
    }

    async function openDoc(rawPath) {
      const path = String(rawPath || '').trim()
      if (state.busy) return
      if (path === '') {
        set({ error: '请先填写 PDF 路径或 arXiv 链接' })
        return
      }
      saveRecord()
      for(const controller of requests.values())controller.abort()
      const sequence=++openSequence
      activeRange = null
      set({ busy: true, error: '', hint: /^https?:\/\//i.test(path) ? '正在下载 arXiv PDF，随后自动打开…' : '正在解析 PDF 版面…' })
      const result = await callHost('open', { path: path })
      if(sequence!==openSequence)return
      if (!result || result.ok !== true || !result.doc) {
        set({ busy: false, error: (result && result.error) || '打开失败', hint: '' })
        return
      }
      const doc = result.doc
      await saveChain
      const saved=await callHost('records-read',{path:doc.path})
      if(sequence!==openSequence)return
      recordContexts.set(doc.path,{revision:saved?.record?.revision || null,writable:saved?.ok===true})
      let record=saved?.ok?saved.record:null
      const drafts=journal?.list(doc.path)||[]
      const recoverable=drafts.find(draft=>draft.revision===(record?.revision || null))
      if(saved?.ok && recoverable){record={...recoverable.record,revision:record?.revision};recordContexts.get(doc.path).recoveredDraft= recoverable.id}
      const restoredPage=Math.min(doc.pageCount,Math.max(1,record?.page || 1))
      restoring=true
      const notes = []
      const changed=record?.version && record.version!==doc.version
      if(changed)notes.push('PDF 已发生变化，旧译文和笔记保留，旧高亮位置已取消，请重新核对')
      if (doc.pageCount > 1) notes.push('已载入 ' + doc.pageCount + ' 页')
      if (doc.mode === 'plain') notes.push('这篇没拿到坐标信息，只能用兜底纯文本抽取，排版可能较差')
      set({
        busy: false,
        doc: doc,
        mode: 'raw',
        page: restoredPage,
        pageInput: String(restoredPage),
        sel: null,
        pickerOpen: false,
        pathDraft: doc.path,
        error: saved?.ok?'':'阅读记录读取失败，已暂停自动保存：'+(saved?.error || '未知错误'),
        items: Array.isArray(record?.items)?record.items:[],
        zoom:['fit','0.5','0.75','1','1.25','1.5','2'].includes(record?.zoom)?record.zoom:'fit',
        marks:Array.isArray(record?.marks)?record.marks.map(mark=>changed?{...mark,rects:[]}:mark):[],
        paperNote:typeof record?.paperNote==='string'?record.paperNote:'',
        recovery:drafts.length && !recoverable?drafts[0]:null,
        hint: notes.length > 0 ? notes.join(' · ') : '划选文字即可翻译',
      })
      restoring=false
      saveRecord()
    }

    function pageTextOf(doc, pageNumber) {
      if (!doc) return ''
      const pages = Array.isArray(doc.pages) ? doc.pages : []
      const blocks = Array.isArray(pages[pageNumber - 1]) ? pages[pageNumber - 1] : []
      return blocks
        .filter(function (block) { return block.k !== 'fig' })
        .map(function (block) { return block.k === 'image' ? (block.sourceText || '') : block.t })
        .join('\n\n')
    }

    /** 整篇论文的正文（所有页，去掉图表标注）——追问的固定上下文 */
    function fullTextOf(doc) {
      if (!doc) return ''
      const pages = Array.isArray(doc.pages) ? doc.pages : []
      const chunks = []
      for (let index = 0; index < pages.length; index += 1) {
        const text = pageTextOf(doc, index + 1)
        if (text !== '') chunks.push('【第 ' + String(index + 1) + ' 页】\n' + text)
      }
      return chunks.join('\n\n')
    }

    async function requestTranslation(kind, text, page) {
      const source = String(text || '').trim()
      if (source === '') return
      itemSeq += 1
      const item = {
        id: 'it' + itemSeq + '-' + Date.now().toString(36),
        kind: kind,
        page: page || 0,
        source: source,
        status: 'pending',
        output: '',
        error: '',
        model: '',
      }
      set({ items: state.items.concat([item]), error: '', hint: '',panelOpen:true,panel:'translation' })
      await runItem(item, item.source)
    }

    async function runItem(item,text) {
      const controller=new AbortController()
      requests.set(item.id,controller)
      let output='',model=''
      set({items:state.items.map(value=>value.id===item.id?{...value,status:'pending',output:'',error:''}:value)})
      try {
        const parts=[]
        // Bounded chunks preserve the whole input instead of silently cutting long pages.
        for(let start=0;start<text.length;){
          let end=Math.min(text.length,start+(item.kind==='ask'?240000:10000))
          if(end<text.length && item.kind!=='ask'){
            const boundary=text.lastIndexOf('\n',end)
            if(boundary>start+5000)end=boundary+1
          }
          parts.push(text.slice(start,end));start=end
        }
        if(item.kind==='ask' && parts.length>1)throw new Error('问答上下文过长，请选择当前页或减少内容')
        for(const part of parts){
          if(output)output+='\n\n'
          const response=await fetch('/api/paperdock/translate-stream',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:part,kind:item.kind}),signal:controller.signal})
          if(!response.ok)throw new Error('翻译请求失败 HTTP '+response.status)
          const reader=response.body.getReader(),decoder=new TextDecoder()
          let buffer='',result
          while(true){
            const {done,value}=await reader.read()
            buffer+=decoder.decode(value || new Uint8Array(),{stream:!done})
            let newline
            while((newline=buffer.indexOf('\n'))!==-1){
              const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1)
              if(!line.trim())continue
              const frame=JSON.parse(line)
              if(frame.type==='delta'){
                output+=frame.text
                set({items:state.items.map(value=>value.id===item.id?{...value,output}:value)})
              }else if(frame.type==='result')result=frame.result
            }
            if(done)break
          }
          if(!result?.ok)throw new Error(result?.error || '翻译连接中断，请重试')
          model=result.model || ''
        }
        applyResult(item.id,{ok:true,text:output,model})
      }catch(error){
        applyResult(item.id,{ok:false,error:controller.signal.aborted?'已停止，已生成内容保留':error.message,model})
      }finally{requests.delete(item.id)}
    }

    function applyResult(itemId, result) {
      const items = state.items.map(function (existing) {
        if (existing.id !== itemId) return existing
        if (result && result.ok === true) {
          return Object.assign({}, existing, {
            status: 'done',
            output: String(result.text || ''),
            model: String(result.model || ''),
          })
        }
        return Object.assign({}, existing, {
          status: 'error',
          error: String((result && result.error) || '请求失败'),
          model: String((result && result.model) || ''),
        })
      })
      const last = items.length > 0 ? items[items.length - 1] : null
      set({ items: items, model: last !== null && last.model !== '' ? last.model : state.model })
    }

    /** 就地问答：问题 + **整篇论文正文** 一起发给模型，答案作为一条消息留在对话框里 */
    async function requestAsk(question) {
      const asked = String(question || '').trim()
      if (asked === '') return
      const doc = state.doc
      const full = state.askScope==='page'?pageTextOf(doc,state.page):state.askScope==='selection'?(state.sel?.text || ''):fullTextOf(doc)
      if(!full.trim()){set({error:'所选范围没有文字，请先选择文字或切换问答范围'});return}
      if(full.length>200000){set({error:'全文超过问答长度上限，请切换为当前页或选区'});return}
      const history=state.items.filter(item=>item.status==='done'&&item.kind==='ask').slice(-4).map(item=>'问：'+item.question+'\n答：'+item.output).join('\n\n')
      itemSeq += 1
      const item = {
        id: 'it' + itemSeq + '-' + Date.now().toString(36),
        kind: 'ask',
        page: 0,
        question: clampText(asked, 2000),
        source: '',
        status: 'pending',
        output: '',
        error: '',
        model: '',
      }
      set({ items: state.items.concat([item]), error: '', hint: '', askDraft: '',panelOpen:true,panel:'translation' })
      let composed = '问题：' + asked+'\n\n相关对话：\n'+history.slice(-24000)
      if (full !== '') {
        composed += '\n\n（以下是《' + (doc && doc.name ? doc.name : '论文') + '》的正文，共 ' +
          String(doc ? doc.pageCount : 0) + ' 页，供你回答时参考）\n' + full
      }
      item.requestText=composed
      await runItem(item,composed)
    }

    function removeItem(id) {
      requests.get(id)?.abort()
      set({ items: state.items.filter(function (item) { return item.id !== id }) })
    }

    function copyText(event, text) {
      try {
        const view = event.currentTarget.ownerDocument.defaultView
        const clipboard = view && view.navigator ? view.navigator.clipboard : null
        if (clipboard && typeof clipboard.writeText === 'function') {
          clipboard.writeText(text).then(function () {
            set({ hint: '译文已复制' })
          }).catch(function () {
            set({ hint: '复制失败，请手动选中后复制' })
          })
          return
        }
      } catch (error) {
        /* 走下面的兜底 */
      }
      set({ hint: '复制失败，请手动选中后复制' })
    }

    /** 读当前选区文本 + 页码，并把活 Range 留在 activeRange 里用于滚动重定位 */
    function readSelection(container) {
      if (!container) return null
      const ownerDoc = container.ownerDocument
      if (!ownerDoc || typeof ownerDoc.getSelection !== 'function') return null
      const selection = ownerDoc.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
      const raw = String(selection.toString() || '')
      const text = raw.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').trim()
      if (text === '') return null
      let page = 0
      const anchor = selection.anchorNode
      const element = anchor && anchor.nodeType === 1 ? anchor : anchor ? anchor.parentElement : null
      if (element && typeof element.closest === 'function') {
        const card = element.closest('[data-pdfpage]')
        if (card) page = Number(card.getAttribute('data-pdfpage')) || 0
      }
      const range = selection.getRangeAt(0)
      if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) return null
      activeRange = range.cloneRange()
      const view = ownerDoc.defaultView
      const rect = range.getBoundingClientRect()
      const pageElement=element?.closest('[data-pdfpage]')
      const bounds=pageElement?.getBoundingClientRect()
      const rects=bounds?.width?Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).map(r=>({x:(r.left-bounds.left)/bounds.width,y:(r.top-bounds.top)/bounds.height,w:r.width/bounds.width,h:r.height/bounds.height})):[]
      return {
        rects,
        text: text,
        length: text.length,
        page: page,
        pos: popPosition(rect, view),
      }
    }

    /** 滚动时按活 Range 重新粘贴气泡；Range 失效或滚出视口就收起来 */
    function repositionPop() {
      if (activeRange === null || state.sel === null) return
      try {
        const rect = activeRange.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
          activeRange = null
          set({ sel: null })
          return
        }
        const view = activeRange.startContainer && activeRange.startContainer.ownerDocument
          ? activeRange.startContainer.ownerDocument.defaultView
          : null
        set({ selPos: popPosition(rect, view) })
      } catch (error) {
        activeRange = null
        set({ sel: null })
      }
    }

    function clearSelection() {
      activeRange = null
      set({ sel: null })
    }

    function docLabel(doc, page) {
      const name = doc && doc.name ? doc.name : '论文'
      return page ? name + ' · 第 ' + page + ' 页' : name
    }

    function startDrag(event, apply) {
      if (event.button !== 0) return
      event.preventDefault()
      const ownerDoc = event.currentTarget.ownerDocument
      const startX = event.clientX
      function onMove(moveEvent) {
        apply(moveEvent.clientX - startX)
      }
      function onUp() {
        ownerDoc.removeEventListener('mousemove', onMove)
        ownerDoc.removeEventListener('mouseup', onUp)
      }
      ownerDoc.addEventListener('mousemove', onMove)
      ownerDoc.addEventListener('mouseup', onUp)
    }

    function button(label, onClick, options) {
      const opts = options || {}
      const className = 'pdk-btn' + (opts.active ? ' is-on' : '') + (opts.square ? ' pdk-sq' : '')
      return h('button', {
        type: 'button',
        className: className,
        title: opts.title || label,
        disabled: opts.disabled === true,
        onClick: onClick,
      }, label)
    }

    function FigureImage(props) {
      const block = props.block
      const failedState = React.useState(false)
      const failed = failedState[0]
      const setFailed = failedState[1]
      if (!block.url || failed) {
        return h('figure', { className: 'pdk-image' },
          h('div', { className: 'pdk-image-error' },
            h('div', null, '图表暂时无法显示，可点击本页“原页”查看。'),
            block.url ? button('重试加载', function () { setFailed(false) }) : null,
          ),
        )
      }
      const rect = block.rect
      return h('figure', { className: 'pdk-image' },
        h('a', { href: block.url, target: '_blank', rel: 'noopener noreferrer', title: '在新标签页查看大图' },
          h('img', { src: block.url, alt: block.label || '论文图表', loading: 'lazy', decoding: 'async',
            width: Math.round((rect.x1 - rect.x0) * 2), height: Math.round((rect.y1 - rect.y0) * 2),
            onError: function () { setFailed(true) },
          }),
        ),
        h('figcaption', null, '点击查看大图'),
      )
    }

    function renderBlocks(blocks) {
      const nodes = []
      for (let index = 0; index < blocks.length; index += 1) {
        const block = blocks[index]
        const key = 'b' + index
        if (block.k === 'image') {
          nodes.push(h(FigureImage, { key: block.url || key, block: block }))
        } else if (block.k === 'fig') {
          nodes.push(h('details', { className: 'pdk-fig', key: key },
            h('summary', null, '图表 / 零散标注'),
            h('div', { className: 'pdk-figbody' }, block.t),
          ))
        } else if (block.k === 'h') {
          nodes.push(h('div', { className: 'pdk-h', key: key }, block.t))
        } else if (block.k === 'cap') {
          nodes.push(h('div', { className: 'pdk-cap', key: key }, block.t))
        } else {
          nodes.push(h('p', { className: 'pdk-p', key: key }, block.t))
        }
      }
      return nodes
    }

    function renderPageCards(doc, onRawPage) {
      const pages = Array.isArray(doc.pages) ? doc.pages : []
      return pages.map(function (blocks, index) {
        const pageNumber = index + 1
        const list = Array.isArray(blocks) ? blocks : []
        return h('div', { className: 'pdk-page', key: 'page-' + String(pageNumber), 'data-pdfpage': String(pageNumber) },
          h('div', { className: 'pdk-pagehead' },
            h('span', null, '第 ' + String(pageNumber) + ' 页'),
            onRawPage ? button('原页', function () { onRawPage(pageNumber) }, { title: '这一页的原始版面（图表、公式）' }) : null,
          ),
          list.length === 0
            ? h('div', { className: 'pdk-blank' }, '这一页没有可提取的文字（扫描件或整页图片）。')
            : h('div', { className: 'pdk-text' }, renderBlocks(list)),
        )
      })
    }

    function renderPicker() {
      const files = Array.isArray(state.docs) ? state.docs : []
      return h('div', { className: 'pdk-pick' },
        state.recent.length?h('div',null,h('div',{className:'pdk-label'},'最近阅读'),state.recent.map(record=>h('div',{className:'pdk-row',key:record.path},
          button(record.path.split(/[\\/]/).pop()+' · 第 '+record.page+' 页',()=>void openDoc(record.path)),
          button('删除记录',()=>set({deletePath:record.path}))))):null,
        state.deletePath?h('div',{className:'pdk-hint',role:'alert'},
          h('span',null,'永久删除这篇论文的译文、标注和笔记？PDF 原文件保留。'),
          button('确认删除',async()=>{
            const path=state.deletePath;clearTimeout(saveTimer)
            const context=recordContexts.get(path);if(context)context.writable=false
            await saveChain
            if(state.doc?.path===path){for(const controller of requests.values())controller.abort();set({doc:null,items:[],marks:[],paperNote:''})}
            const result=await callHost('records-remove',{path})
            if(result?.ok){for(const draft of journal?.list(path)||[])journal.remove(draft.id);set({deletePath:'',recent:state.recent.filter(record=>record.path!==path)})}
            else set({error:result?.error || '删除失败'})
          }),button('取消',()=>set({deletePath:''}))):null,
        h('div', { className: 'pdk-label' }, state.root ? '工作区：' + state.root : '还没有工作区，可直接填写绝对路径'),
        h('div', { className: 'pdk-row' },
          h('input', {
            className: 'pdk-input',
            placeholder: 'PDF 绝对路径、工作区相对路径或 arXiv 链接',
            value: state.pathDraft,
            onChange: function (event) { set({ pathDraft: event.target.value }) },
            onKeyDown: function (event) {
              if (event.key === 'Enter') void openDoc(event.target.value)
            },
          }),
          button('打开', function () { void openDoc(state.pathDraft) }, { title: '打开本地 PDF 或下载 arXiv 论文', disabled: state.busy }),
        ),
        h('div', { className: 'pdk-label' }, 'arXiv 下载保存到工作区 paper_pdfs；已有同名 PDF 会直接打开。'),
        h('div', { className: 'pdk-row' },
          h('div', { className: 'pdk-label', style: { flex: '1 1 auto' } }, state.docsLoading ? '正在检索工作区里的 PDF…' : '共 ' + String(files.length) + ' 篇 PDF'),
          button('刷新', function () { void loadList() }, { title: '重新扫描工作区' }),
        ),
        h('div', { className: 'pdk-files' },
          files.map(function (file) {
            return h('button', {
              type: 'button',
              key: file.path,
              className: 'pdk-file',
              title: file.path,
              onClick: function () { void openDoc(file.path) },
            },
              h('span', { className: 'pdk-filename' }, file.name),
              h('span', { className: 'pdk-label' }, formatSize(file.size)),
            )
          }),
        ),
        files.length === 0 && state.docsLoaded && !state.docsLoading
          ? h('div', { className: 'pdk-blank' }, '这个目录下没找到 PDF。可以在上面直接写路径，例如 E:\\papers\\attention.pdf')
          : null,
      )
    }

    function hintBar() {
      const text = state.error !== '' ? state.error : state.hint
      if (text === '') return null
      const isError = state.error !== ''
      return h('div', { className: 'pdk-hint' + (isError ? ' is-error' : '') },
        h('div', { className: 'pdk-hint-text' }, text),
        button('✕', function () {
          set(isError ? { error: '' } : { hint: '' })
        }, { square: true, title: '关闭提示' }),
      )
    }

    /* --------------------------------------------------------- 翻译视图（双栏） */
    function PdfTranslateView() {
      const st = useSync()
      React.useEffect(()=>{
        const flush=()=>saveRecord()
        globalThis.addEventListener('pagehide',flush)
        return ()=>{for(const controller of requests.values())controller.abort();saveRecord();clearTimeout(saveTimer);globalThis.removeEventListener('pagehide',flush)}
      },[])
      const rootRef = React.useRef(null)
      const leftRef = React.useRef(null)
      const streamRef = React.useRef(null)
      const askRef = React.useRef(null)
      const doc = st.doc

      React.useEffect(function () {
        if (!state.docsLoaded && !state.docsLoading) void loadList()
      }, [])

      React.useEffect(function () {
        const container = streamRef.current
        if (container && typeof container.scrollHeight === 'number') container.scrollTop = container.scrollHeight
      }, [st.items.length, st.items.map(function (item) { return item.status }).join(',')])

      function onDividerStart(event) {
        const startSplit = state.split
        const parent = event.currentTarget.parentElement
        const trackWidth = parent && parent.clientWidth ? parent.clientWidth : 1200
        startDrag(event, function (delta) {
          const next = Math.min(Math.max(0.28, startSplit + delta / trackWidth), 0.72)
          set({ split: next })
        })
      }

      function onSelectionGesture(event) {
        const found = readSelection(event.currentTarget)
        if (found !== null) {
          set({ sel: found, selPos: found.pos })
          return
        }
        if (state.sel !== null) {
          activeRange = null
          set({ sel: null })
        }
      }

      function onLeftScroll(event) {
        if (state.mode !== 'text') return
        const container = event.currentTarget
        const cards = container.querySelectorAll('[data-pdfpage]')
        let current = 1
        for (let index = 0; index < cards.length; index += 1) {
          const card = cards[index]
          if (card.offsetTop - container.scrollTop <= 28) {
            current = Number(card.getAttribute('data-pdfpage')) || current
          }
        }
        if (current !== state.page) set({ page: current, pageInput: String(current) })
        repositionPop()
      }

      function gotoPage(next) {
        if (!doc) return
        const target = Math.min(Math.max(1, next), Math.max(1, doc.pageCount))
        clearSelection()
        set({ page: target, pageInput: String(target) })
        const container = leftRef.current
        if (container) {
          const card = container.querySelector('[data-pdfpage="' + target + '"]')
          if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'start' })
        }
      }

      async function sendSelection(kind, text, page) {
        if (!text.trim() || state.sendingToChat) return
        const instruction = kind === 'translate' ? '请将以下论文原文翻译成中文，保留公式、术语和引用编号，直接给出译文。' : '请用中文解释以下论文原文，说明关键概念和推导。'
        try {
          set({ error: '', sendingToChat: true })
          const constraints = '本次任务只处理下方已提供的论文原文，直接在对话中回答。不要调用工具、执行命令、重新读取或提取 PDF，也不要创建或写入任何文件（包括临时脚本和文本）。论文名和页码仅用于标识来源。若原文不足以解释某处，请在回答中说明，不要自行读取其他页面。'
          await sendToConversation(instruction + '\n' + constraints + '\n\n论文：' + doc.name + '\n页码：' + page + '\n\n以下是论文引用内容：\n' + text)
          clearSelection()
        } catch (error) { set({ error: '发送到左侧会话失败：' + error.message }) }
        finally { set({ sendingToChat: false }) }
      }
      function translateSelection(kind) {
        if (state.sel) void sendSelection(kind, state.sel.text, state.sel.page)
      }
      function translateCurrentPage() {
        if (!doc) return
        const text = pageTextOf(doc, state.page)
        if (!text.trim()) { set({ error: '这一页没有可翻译的文字' }); return }
        void sendSelection('translate', text, state.page)
      }

      function renderLeftBody() {
        if (!doc || state.pickerOpen) return h('div', { className: 'pdt-scroll' }, renderPicker())
        if (state.mode === 'raw') {
          return h(PdfReader, {url:doc.rawUrl,page:st.page,zoom:st.zoom,toolsOpen:st.toolsOpen,
            marks:st.marks,onPage:gotoPage,onZoom:value=>set({zoom:value}),onSelection:onSelectionGesture,
            onError:error=>set({error})})
        }
        return h('div', {
          className: 'pdt-scroll',
          ref: leftRef,
          onScroll: onLeftScroll,
          onMouseUp: onSelectionGesture,
          onKeyUp: onSelectionGesture,
        }, renderPageCards(doc, function (pageNumber) {
          set({ mode: 'raw', page: pageNumber, pageInput: String(pageNumber) })
        }))
      }


      const leftBar = h('div', { className: 'pdt-bar' },
        button('📂', function () { set({ pickerOpen: !state.pickerOpen }) }, { square: true, active: st.pickerOpen, title: doc ? '换一篇 PDF' : '打开 PDF' }),
        h('div', { className: 'pdt-title', style: { flex: '1 1 auto', minWidth: 0 }, title: doc?.name }, doc?.name || '未打开 PDF'),
        doc ? h(React.Fragment, null,
          button('‹',()=>gotoPage(st.page-1),{disabled:st.page<=1,title:'上一页'}),
          h('input',{className:'pdk-pageinput','aria-label':'页码',value:st.pageInput,onChange:e=>set({pageInput:e.target.value}),onKeyDown:e=>{if(e.key==='Enter')gotoPage(parseInt(e.target.value,10)||1)}}),
          h('span',null,'/ '+doc.pageCount),
          button('›',()=>gotoPage(st.page+1),{disabled:st.page>=doc.pageCount,title:'下一页'}),
          button('更多',()=>set({toolsOpen:!st.toolsOpen}),{active:st.toolsOpen}),
        ):null,
      )
      const leftNav = doc && st.toolsOpen ? h('div',{className:'pdk-nav'},
        button(st.mode==='raw'?'文本模式':'原版 PDF',()=>set({mode:st.mode==='raw'?'text':'raw'})),
        button('翻译本页',translateCurrentPage,{title:'在左侧会话中翻译本页'}),
        button(st.panelOpen?'收起笔记':'笔记',()=>set({panelOpen:!st.panelOpen,panel:'notes'})),
      ):null

      const rightBar = h('div', { className: 'pdt-bar' },
        h('span', { className: 'pdt-title' }, '笔记'),
        h('span', { style: { flex: '1 1 auto' } }),
        button('收起',()=>set({panelOpen:false})),
        st.recovery?button('导出冲突草稿',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(st.recovery,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='paperdock-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}):null,
        doc?button('导出',()=>{
          const text='# '+doc.name+'\n\n'+state.paperNote+'\n\n'+state.marks.map(mark=>'## 第 '+mark.page+' 页\n> '+mark.text+'\n\n'+mark.note).join('\n\n')+'\n\n'+state.items.map(item=>'## '+(item.question || '第 '+item.page+' 页')+'\n\n'+item.output).join('\n\n')
          const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'})),anchor=document.createElement('a')
          anchor.href=url;anchor.download=doc.name.replace(/\.pdf$/i,'')+'-阅读笔记.md';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
        }):null,

      )

      const pop = st.sel && doc && !state.pickerOpen
        ? h('div', { className: 'pdt-pop', onMouseDown: event => event.preventDefault(), style: { top: st.selPos.top + 'px', left: st.selPos.left + 'px' } },
            h('span', { className: 'pdt-popcount', title: st.sel.text }, '已选 ' + String(st.sel.length) + ' 字'),
            h('span', { className: 'pdt-popsep' }),
            button('高亮/批注',function(){
              const selection=state.sel
              set({marks:state.marks.concat([{id:'mark-'+Date.now(),page:selection.page,text:selection.text,rects:state.mode==='raw'?selection.rects:[],note:''}]),panel:'notes',panelOpen:true})
              clearSelection()
            }),
            button('翻译', function () { translateSelection('translate') }, { title: '在左侧会话中翻译', disabled: st.sendingToChat }),
            button('讲解', function () { translateSelection('explain') }, { title: '在左侧会话中讲解', disabled: st.sendingToChat }),
            button('✕', clearSelection, { square: true, title: '取消选区' }),
          )
        : null

      const leftWidth = Math.round(Math.min(Math.max(0.28, st.split), 0.72) * 100)

      return h('div', {
        className: 'pdt-root',
        ref: rootRef,
        style: { height: '100%', width: '100%' },
      },
        h('div', { className: 'pdt-left', style: { width: leftWidth + '%', flex: '0 0 auto' } },
          leftBar,
          leftNav,
          !st.panelOpen?hintBar():null,
          doc && doc.mode === 'plain'
            ? h('div', { className: 'pdk-hint' }, h('div', { className: 'pdk-hint-text' }, '这篇 PDF 没拿到坐标信息，用的是兜底纯文本抽取，排版可能较差。'))
            : null,
          renderLeftBody(),
        ),
        h('div', { className: 'pdt-divider', onMouseDown: onDividerStart, title: '拖动调整左右宽度' }),
        st.panelOpen && st.panel==='notes'?h('div', { className: 'pdt-right', style: { flex: '1 1 auto' } },
          rightBar,
          hintBar(),
          h('div',{className:'pdt-scroll'},
            h('div',{className:'pdk-pick'},h('label',null,'论文笔记'),h('textarea',{className:'pdk-input',style:{height:140},value:st.paperNote,onChange:event=>set({paperNote:event.target.value})})),
            st.marks.map(mark=>h('div',{className:'pdt-item',key:mark.id},
              button('第 '+mark.page+' 页',()=>gotoPage(mark.page)),h('blockquote',null,mark.text),
              h('textarea',{className:'pdk-input',style:{height:70},placeholder:'添加批注…',value:mark.note,onChange:event=>set({marks:state.marks.map(item=>item.id===mark.id?{...item,note:event.target.value}:item)})}),
              button('删除标注',()=>set({marks:state.marks.filter(item=>item.id!==mark.id)})))))
          ,

        ):null,
        pop,
      )
    }

    return PdfTranslateView
    }

    function ReaderTab({sendToConversation} = {}) {
      const sender = React.useRef(sendToConversation)
      sender.current = sendToConversation
      const [Reader] = React.useState(() => createReader(text => sender.current(text)))
      return h(Reader)
    }

    ctx.effect(() => ctx.get('sidebarRightTabs').register({
      id: 'paperdock-reader',
      kind: 'paperdock',
      multiple: true,
      keepMounted: true,
      title: () => 'PaperDock',
      guide: [{ id: 'open', order: 25, title: () => 'PaperDock', description: () => '阅读论文、划词翻译与精读问答', icon: () => h('span', null, '📖') }],
    }))
    ctx.effect(() => slots.inject('sidebar.right.pane.tab', () => slots.register(
      { name: 'sidebar.right.pane.tab', key: 'paperdock-reader', inject: sessionId => ({
        sendToConversation: text => {
          const scope = ctx.get('sessions').scope(sessionId)
          if (!scope) throw new Error('当前会话不可用，请先打开一个会话')
          const conversation = scope.get('conversation')
          if (!conversation) throw new Error('原生对话服务不可用')
          return conversation.send(text)
        },
      }) },
      ReaderTab,
    )))
  },
}

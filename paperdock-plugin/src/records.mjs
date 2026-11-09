import {mkdir,readFile,writeFile,rename,unlink,readdir} from 'node:fs/promises'
import {createHash,randomUUID} from 'node:crypto'
import {join} from 'node:path'

export function createRecordStore(directory) {
 const pending=new Map()
 function file(path) {
  if(typeof path!=='string'||!path.trim()||path.length>32768)throw new Error('Invalid document path')
  return join(directory,createHash('sha256').update(path).digest('hex')+'.json')
 }
 async function read(path){
  try{return JSON.parse(await readFile(file(path),'utf8'))}
  catch(error){if(error.code==='ENOENT')return null;throw error}
 }
 function serial(path,operation) {
  const previous=pending.get(path)||Promise.resolve()
  const task=previous.catch(()=>{}).then(operation)
  pending.set(path,task)
  void task.finally(()=>{if(pending.get(path)===task)pending.delete(path)}).catch(()=>{})
  return task
 }
 return {
  read,
  write(path,record,expectedRevision=null){return serial(path,async()=>{
   const current=await read(path)
   if((current?.revision || null)!==expectedRevision)throw new Error('阅读记录已在其他标签修改或删除，请重新打开后再保存')
   if(!record||!Number.isInteger(record.page)||record.page<1)throw new Error('Invalid page')
   if(!Array.isArray(record.items)||record.items.length>2000)throw new Error('Invalid reading items')
   const value={...record,path,updatedAt:new Date().toISOString(),revision:randomUUID(),schema:1}
   const text=JSON.stringify(value)
   if(Buffer.byteLength(text)>8*1024*1024)throw new Error('阅读记录超过 8MB，请先导出或清理')
   const destination=file(path),temp=destination+'.'+randomUUID()+'.tmp'
   await mkdir(directory,{recursive:true})
   try {await writeFile(temp,text,{mode:0o600});await rename(temp,destination)}
   finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error})}
   return value
  })},
  remove(path){return serial(path,()=>unlink(file(path)).catch(error=>{if(error.code!=='ENOENT')throw error}))},
  async list(){
   let entries
   try{entries=await readdir(directory)}catch(error){if(error.code==='ENOENT')return [];throw error}
   const records=await Promise.all(entries.filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(async name=>{
    try{const value=JSON.parse(await readFile(join(directory,name),'utf8'));return {path:value.path,page:value.page,updatedAt:value.updatedAt}}
    catch(error){if(error.code==='ENOENT')return null;throw error}
   }))
   return records.filter(Boolean).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))
  }
 }
}

/** Small synchronous recovery journal; remote records remain authoritative. */
export function createDraftJournal(storage) {
 const prefix='paperdock-draft-v2:'
 return {
  write(id,path,record,revision){storage.setItem(prefix+id,JSON.stringify({path,record,revision,updatedAt:Date.now()}))},
  remove(id){storage.removeItem(prefix+id)},
  list(path){
   const result=[]
   for(let n=0;n<storage.length;n++){
    const key=storage.key(n)
    if(!key?.startsWith(prefix))continue
    try{const value=JSON.parse(storage.getItem(key));if(value.path===path)result.push({...value,id:key.slice(prefix.length)})}catch{/* Leave corrupt drafts untouched for manual recovery. */}
   }
   return result.sort((a,b)=>b.updatedAt-a.updatedAt)
  },
 }
}

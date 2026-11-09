import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {installManagedBundle,runDsh} from '../install-bundle.mjs'
const packageName='dsh-session-delete-plugin'
export const SESSION_DELETE_PATCH_V2='- insert:\n    - id: session-delete\n      name: dsh-session-delete-plugin\n'
export const SESSION_DELETE_PATCH='- id: api-gateway\n  disabled: true\n- id: ui-workspace\n  disabled: true\n'+SESSION_DELETE_PATCH_V2
export function removeLegacyMount(text) {
 const begin='# BEGIN dsh-session-delete-plugin',end='# END dsh-session-delete-plugin'
 if(text.includes(begin)){
  if(text.split(begin).length!==2||text.split(end).length!==2||text.indexOf(end)<text.indexOf(begin))throw new Error('Malformed session-delete markers')
  const start=text.indexOf(begin),finish=text.indexOf(end)
  const inside=text.slice(start+begin.length,finish).replace(/\r\n/g,'\n')
  // Historical markers sometimes surrounded unrelated model/theme settings.
  const preserved=inside.replace(SESSION_DELETE_PATCH,'').replace(SESSION_DELETE_PATCH_V2,'').trim()
  return text.slice(0,start)+(preserved?preserved+'\n':'')+text.slice(finish+end.length).replace(/^\r?\n/,'')
 }
 return text.replace(/^- insert:\r?\n {4}- id: session-delete\r?\n {6}name: ['"]?dsh-session-delete-plugin['"]?\s*\r?\n/gm,'')
}
export const installSessionDelete=options=>installManagedBundle({...options,packageName,removeLegacyMount})
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.platform!=='win32')throw new Error('Run install-to-dsh.ps1 in Windows PowerShell')
  if(!process.argv[2])throw new Error('Pass the packed .tgz path')
  const result=installSessionDelete({source:path.dirname(fileURLToPath(import.meta.url)),archive:process.argv[2],
    profileDir:path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE,'.dsh'),'profiles','web'),run:runDsh})
  for(const warning of result.warnings || [])console.warn(warning)
  console.log('Installed by DSH: '+result.installed+' ('+result.version+')')
 }catch(error){console.error(error.message);process.exitCode=1}
}

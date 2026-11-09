/** Standard DSH package-manager installation. No runtime copies or junction creation. */
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {installManagedBundle,runDsh} from '../install-bundle.mjs'
const packageName='paperdock-dsh-plugin'

export function removeLegacyMount(text) {
  const newline=text.includes('\r\n')?'\r\n':'\n'
  const lines=text.split(/\r?\n/)
  for(let index=0;index<lines.length;index++) {
    if(lines[index]!=='- insert:' || lines[index+1]!=='    - id: paperdock' || !/^      name: ['"]?paperdock-dsh-plugin['"]?[ \t]*$/.test(lines[index+2] || ''))continue
    let end=index+3
    while(end<lines.length && (/^[ \t]/.test(lines[end]) || lines[end]===''))end++
    const extra=lines.slice(index+3,end)
    if(extra.some(line=>line.trim() && !line.startsWith('      ')))throw new Error('PaperDock legacy insertion contains other entries; split that group before installing')
    const replacement=extra.some(line=>line.trim() && !line.trimStart().startsWith('#'))
      ?lines.slice(index+1,end).map(line=>line.startsWith('    ')?line.slice(4):line):[]
    lines.splice(index,end-index,...replacement)
    index+=replacement.length-1
  }
  return lines.filter(line=>!line.startsWith('# PaperDock: profile-level UI plugin')).join(newline)
}

export const installPaperdock=options=>installManagedBundle({...options,packageName,removeLegacyMount})

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  if(process.platform!=='win32')throw new Error('Run install-to-dsh.ps1 in Windows PowerShell')
  const archive=process.argv[2]
  if(!archive)throw new Error('Pass the packed .tgz path')
  const result=installPaperdock({source:path.dirname(fileURLToPath(import.meta.url)),archive,
    profileDir:path.join(process.env.DSH_HOME || path.join(process.env.USERPROFILE,'.dsh'),'profiles','web'),
    run:runDsh})
  for(const warning of result.warnings || [])console.warn(warning)
  console.log('Installed by DSH: '+result.installed+' ('+result.version+')')
  console.log('Restart DSH and open PaperDock in the native right sidebar.')
 }catch(error){console.error(error.message);process.exitCode=1}
}

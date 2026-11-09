import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
export function installManagedBundle({source,profileDir,archive,run,packageName,removeLegacyMount}) {
  source=path.resolve(source);profileDir=path.resolve(profileDir);archive=path.resolve(archive)
  if(JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).name!==packageName)throw new Error('Source package name does not match')
  if(!fs.statSync(archive).isFile())throw new Error('Missing package archive')
  const patchFile=path.join(profileDir,'cordis.patch.yml')
  const previous=fs.readFileSync(patchFile,'utf8'),next=removeLegacyMount(previous)
  if(next!==previous)fs.writeFileSync(patchFile,next)
  try {
    run(['plugin','--profile','web','add',archive])
    const installed=path.join(profileDir,'node_modules',packageName)
    const manifest=JSON.parse(fs.readFileSync(path.join(installed,'package.json'),'utf8'))
    const expected=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'))
    if(manifest.name!==packageName || manifest.version!==expected.version || !manifest.dsh?.bundle)throw new Error('Installed package does not match the new bundle')
    ensureBundleSelected(path.join(profileDir,'package.json'),packageName)
    const warnings=cleanupLegacyRuntime({profileDir,packageName,installed})
    return {installed,version:manifest.version,warnings}
  }catch(error){
    // Preserve any patch changes made by DSH itself; do not overwrite concurrent edits.
    if(next!==previous && fs.readFileSync(patchFile,'utf8')===next)fs.writeFileSync(patchFile,previous)
    throw error
  }
}


export function runDsh(args) {
 if(args.some(arg=>/[\r\n"%&|<>^]/.test(arg)))throw new Error('Unsupported characters in package path')
 const child=spawnSync('cmd.exe',['/d','/v:off','/s','/c','dsh '+args.map(arg=>'"'+arg+'"').join(' ')],{stdio:'inherit',windowsVerbatimArguments:true})
 if(child.error)throw child.error
 if(child.status!==0)throw new Error('DSH plugin installation failed: '+child.status)
}

export function cleanupLegacyRuntime({profileDir,packageName,installed}) {
 const warnings=[]
 if(path.basename(path.dirname(profileDir))!=='profiles')return warnings
 const home=path.dirname(path.dirname(profileDir)),legacy=path.join(home,'plugins',packageName),shared=path.join(home,'profiles','node_modules',packageName)
 try{
  if(!fs.existsSync(legacy))return warnings
  if(fs.lstatSync(legacy).isSymbolicLink())return ['旧运行目录是链接，已保留：'+legacy]
  const old=JSON.parse(fs.readFileSync(path.join(legacy,'package.json'),'utf8'))
  if(old.name!==packageName)return ['旧目录包名不匹配，已保留：'+legacy]
  const current=fs.realpathSync(installed),previous=fs.realpathSync(legacy)
  if(current===previous||current.startsWith(previous+path.sep))return ['新安装仍引用旧目录，未清理：'+legacy]
  const allowed=new Set(['package.json','README.md','THIRD_PARTY_LICENSE','lib','node_modules'])
  if(fs.readdirSync(legacy).some(name=>!allowed.has(name)))return ['旧目录含额外文件，已保留：'+legacy]
  try{if(fs.lstatSync(shared).isSymbolicLink()&&fs.realpathSync(shared)===previous)fs.unlinkSync(shared)}catch(error){if(error.code!=='ENOENT')throw error}
  fs.rmSync(legacy,{recursive:true})
 }catch(error){warnings.push('旧运行目录清理失败：'+error.message)}
 return warnings
}

// DSH preserves activation when replacing an existing plain dependency. This
// explicit migration selects the newly verified bundle without re-installing it.
export function ensureBundleSelected(profileFile,packageName) {
 const before=fs.readFileSync(profileFile,'utf8')
 const manifest=JSON.parse(before.replace(/^\uFEFF/,''))
 const bundles=manifest.dsh?.profile?.bundles || []
 if(!Array.isArray(bundles))throw new Error('Profile bundles must be an array')
 if(bundles.includes(packageName))return
 const updated={...manifest,dsh:{...manifest.dsh,profile:{...manifest.dsh?.profile,bundles:[...bundles,packageName]}}}
 const temporary=profileFile+'.paperdock-'+randomUUID()+'.tmp'
 try{
  fs.writeFileSync(temporary,JSON.stringify(updated,null,2)+'\n',{mode:fs.statSync(profileFile).mode})
  if(fs.readFileSync(profileFile,'utf8')!==before)throw new Error('Profile changed during bundle activation; rerun the installer')
  fs.renameSync(temporary,profileFile)
 }finally{fs.rmSync(temporary,{force:true})}
}

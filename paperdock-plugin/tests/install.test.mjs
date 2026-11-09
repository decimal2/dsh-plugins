import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {installPaperdock,removeLegacyMount} from '../install.mjs'
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paperdock-package-')),source=path.join(root,'source'),profileDir=path.join(root,'web'),archive=path.join(root,'paperdock.tgz')
 fs.mkdirSync(source);fs.mkdirSync(profileDir)
 const manifest={name:'paperdock-dsh-plugin',version:'2.0.0',dsh:{bundle:{patch:'./cordis.patch.yml'}}}
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(manifest));fs.writeFileSync(archive,'test archive')
 const patch='- insert:\n    - id: paperdock\n      name: paperdock-dsh-plugin\n- id: theme\n  config: keep\n'
 fs.writeFileSync(path.join(profileDir,'cordis.patch.yml'),patch)
 return {root,source,profileDir,archive,patch,manifest}
}
test('uses the DSH manager to install a bundle, without creating an extra runtime copy',()=>{
 const f=fixture();let args
 try{
  const result=installPaperdock({...f,run:value=>{
   args=value
   const installed=path.join(f.profileDir,'node_modules','paperdock-dsh-plugin');fs.mkdirSync(installed,{recursive:true});fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify(f.manifest))
   fs.writeFileSync(path.join(f.profileDir,'package.json'),JSON.stringify({dsh:{profile:{bundles:['other','paperdock-dsh-plugin']}}}))
  }})
  assert.deepEqual(args,['plugin','--profile','web','add',f.archive])
  assert.equal(result.installed,path.join(f.profileDir,'node_modules','paperdock-dsh-plugin'))
  assert.equal(fs.readFileSync(path.join(f.profileDir,'cordis.patch.yml'),'utf8'),'- id: theme\n  config: keep\n')
  assert.equal(fs.existsSync(path.join(f.root,'plugins')),false)
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})
test('failed package install restores the old mount without changing other configuration',()=>{
 const f=fixture()
 try{
  assert.throws(()=>installPaperdock({...f,run:()=>{throw new Error('pnpm failed')}}),/pnpm failed/)
  assert.equal(fs.readFileSync(path.join(f.profileDir,'cordis.patch.yml'),'utf8'),f.patch)
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})
test('legacy migration leaves unrelated and customized entries intact',()=>{
 const custom='- insert:\n    - id: paperdock\n      name: another-package\n'
 assert.equal(removeLegacyMount(custom),custom)
})

test('verified standard install cleans only the recognized old runtime and its shared junction',async()=>{
 const {cleanupLegacyRuntime}=await import('../../install-bundle.mjs')
 const f=fixture(),home=path.join(f.root,'home'),profileDir=path.join(home,'profiles','web'),old=path.join(home,'plugins','paperdock-dsh-plugin'),installed=path.join(profileDir,'node_modules','paperdock-dsh-plugin'),shared=path.join(home,'profiles','node_modules','paperdock-dsh-plugin')
 try{
  for(const folder of [old,installed,path.dirname(shared)])fs.mkdirSync(folder,{recursive:true})
  fs.writeFileSync(path.join(old,'package.json'),JSON.stringify(f.manifest))
  fs.symlinkSync(old,shared,'junction')
  assert.deepEqual(cleanupLegacyRuntime({profileDir,packageName:f.manifest.name,installed}),[])
  assert.equal(fs.existsSync(old),false);assert.equal(fs.existsSync(shared),false)
  assert.equal(fs.existsSync(installed),true)
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})

test('migrating a customized legacy PaperDock row preserves its settings as a bundle override',()=>{
 const input='- insert:\n    - id: paperdock\n      name: paperdock-dsh-plugin\n      config:\n        custom: keep\n- id: theme\n  config: dark\n'
 assert.equal(removeLegacyMount(input),'- id: paperdock\n  name: paperdock-dsh-plugin\n  config:\n    custom: keep\n- id: theme\n  config: dark\n')
})

test('upgrading an existing plain dependency explicitly selects its new bundle and remains idempotent',()=>{
 const f=fixture()
 try{
  const profileFile=path.join(f.profileDir,'package.json')
  const previous={dependencies:{'paperdock-dsh-plugin':'file:old',unrelated:'1'},dsh:{profile:{bundles:['base','agentero-dsh'],custom:'keep'}},custom:{keep:true}}
  fs.writeFileSync(profileFile,JSON.stringify(previous))
  const run=()=>{
   const installed=path.join(f.profileDir,'node_modules',f.manifest.name);fs.mkdirSync(installed,{recursive:true})
   fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify(f.manifest))
   const profile=JSON.parse(fs.readFileSync(profileFile,'utf8'));profile.dependencies[f.manifest.name]='file:new.tgz'
   fs.writeFileSync(profileFile,JSON.stringify(profile)) // DSH deliberately only auto-enables NEW dependencies.
  }
  installPaperdock({...f,run})
  installPaperdock({...f,run})
  const result=JSON.parse(fs.readFileSync(profileFile,'utf8'))
  assert.deepEqual(result.dsh.profile.bundles,['base','agentero-dsh','paperdock-dsh-plugin'])
  assert.equal(result.dsh.profile.custom,'keep')
  assert.deepEqual(result.custom,{keep:true})
  assert.equal(result.dependencies.unrelated,'1')
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})

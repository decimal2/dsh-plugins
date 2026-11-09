import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {installSessionDelete,removeLegacyMount} from '../install.mjs'
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'session-delete-package-')),source=path.join(root,'source'),profileDir=path.join(root,'web'),archive=path.join(root,'session-delete.tgz')
 fs.mkdirSync(source);fs.mkdirSync(profileDir)
 const manifest={name:'dsh-session-delete-plugin',version:'2.1.0',dsh:{bundle:{patch:'./cordis.patch.yml'}}}
 fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(manifest));fs.writeFileSync(archive,'test archive')
 const patch='- insert:\n    - id: session-delete\n      name: dsh-session-delete-plugin\n- id: theme\n  config: keep\n'
 fs.writeFileSync(path.join(profileDir,'cordis.patch.yml'),patch)
 return {root,source,profileDir,archive,patch,manifest}
}
test('uses the DSH manager to install a bundle, without creating an extra runtime copy',()=>{
 const f=fixture();let args
 try{
  const result=installSessionDelete({...f,run:value=>{
   args=value
   const installed=path.join(f.profileDir,'node_modules','dsh-session-delete-plugin');fs.mkdirSync(installed,{recursive:true});fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify(f.manifest))
   fs.writeFileSync(path.join(f.profileDir,'package.json'),JSON.stringify({dsh:{profile:{bundles:['other','dsh-session-delete-plugin']}}}))
  }})
  assert.deepEqual(args,['plugin','--profile','web','add',f.archive])
  assert.equal(result.installed,path.join(f.profileDir,'node_modules','dsh-session-delete-plugin'))
  assert.equal(fs.readFileSync(path.join(f.profileDir,'cordis.patch.yml'),'utf8'),'- id: theme\n  config: keep\n')
  assert.equal(fs.existsSync(path.join(f.root,'plugins')),false)
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})
test('failed package install restores the old mount without changing other configuration',()=>{
 const f=fixture()
 try{
  assert.throws(()=>installSessionDelete({...f,run:()=>{throw new Error('pnpm failed')}}),/pnpm failed/)
  assert.equal(fs.readFileSync(path.join(f.profileDir,'cordis.patch.yml'),'utf8'),f.patch)
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})
test('legacy migration leaves unrelated and customized entries intact',()=>{
 const custom='- insert:\n    - id: session-delete\n      name: another-package\n'
 assert.equal(removeLegacyMount(custom),custom)
})

test('upgrading an existing plain dependency explicitly selects its new bundle and remains idempotent',()=>{
 const f=fixture()
 try{
  const profileFile=path.join(f.profileDir,'package.json')
  const previous={dependencies:{'dsh-session-delete-plugin':'file:old',unrelated:'1'},dsh:{profile:{bundles:['base','agentero-dsh'],custom:'keep'}},custom:{keep:true}}
  fs.writeFileSync(profileFile,JSON.stringify(previous))
  const run=()=>{
   const installed=path.join(f.profileDir,'node_modules',f.manifest.name);fs.mkdirSync(installed,{recursive:true})
   fs.writeFileSync(path.join(installed,'package.json'),JSON.stringify(f.manifest))
   const profile=JSON.parse(fs.readFileSync(profileFile,'utf8'));profile.dependencies[f.manifest.name]='file:new.tgz'
   fs.writeFileSync(profileFile,JSON.stringify(profile)) // DSH deliberately only auto-enables NEW dependencies.
  }
  installSessionDelete({...f,run})
  installSessionDelete({...f,run})
  const result=JSON.parse(fs.readFileSync(profileFile,'utf8'))
  assert.deepEqual(result.dsh.profile.bundles,['base','agentero-dsh','dsh-session-delete-plugin'])
  assert.equal(result.dsh.profile.custom,'keep')
  assert.deepEqual(result.custom,{keep:true})
  assert.equal(result.dependencies.unrelated,'1')
 }finally{fs.rmSync(f.root,{recursive:true,force:true})}
})

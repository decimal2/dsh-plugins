import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {loadProfileDirectory,readProfilePlugins,composeEntries} from '@deepseek-ai/dsh-app-boot'
const require=createRequire(import.meta.url)
test('native DSH loader discovers both standard bundles and composes one mount each',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-standard-bundles-'))
 try{
  const profileDir=path.join(root,'profiles','web')
  fs.mkdirSync(profileDir,{recursive:true})
  const packages=[['paperdock-dsh-plugin','../../paperdock-plugin'],['dsh-session-delete-plugin','..']]
  for(const [name,relative] of packages){
   const target=path.join(profileDir,'node_modules',name),source=path.resolve(import.meta.dirname,relative)
   fs.mkdirSync(target,{recursive:true})
   for(const file of ['package.json','cordis.patch.yml'])fs.copyFileSync(path.join(source,file),path.join(target,file))
  }
  const bundles=packages.map(([name])=>name)
  fs.writeFileSync(path.join(profileDir,'package.json'),JSON.stringify({dependencies:Object.fromEntries(bundles.map(name=>[name,'file:archive.tgz'])),dsh:{profile:{bundles}}}))
  fs.writeFileSync(path.join(profileDir,'cordis.patch.yml'),'[]\n')
  const installAnchor=path.resolve(path.dirname(require.resolve('@deepseek-ai/dsh-app-boot/package.json')),'../../..','package.json')
  const profile=loadProfileDirectory('dsh',profileDir,installAnchor)
  assert.deepEqual(profile.skippedBundles,[])
  assert.deepEqual(profile.layers.map(layer=>layer.packageName),bundles)
  const entries=composeEntries(profile.layers.map(layer=>layer.patches))
  assert.equal(entries.filter(entry=>entry.id==='paperdock').length,1)
  assert.equal(entries.filter(entry=>entry.id==='session-delete').length,1)
  const listed=readProfilePlugins({binName:'dsh',profileDir,installAnchor})
  assert.ok(listed.dependencies.every(item=>item.bundle&&item.enabled))
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {removeLegacyMount,SESSION_DELETE_PATCH} from '../install.mjs'
import {composeEntries,loadOverlayPatches} from '@deepseek-ai/dsh-app-boot'
const require=createRequire(import.meta.url)
test('v2 migration preserves embedded settings and native gateway/workspace',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-v2-install-'))
 try {
  const dshDir=path.join(root,'dsh'),profileDir=path.join(root,'profiles/web')
  fs.mkdirSync(dshDir,{recursive:true});fs.mkdirSync(profileDir,{recursive:true})
  fs.writeFileSync(path.join(dshDir,'package.json'),JSON.stringify({name:'@deepseek-ai/dsh',version:'0.2.2-rc.1'}))
  fs.writeFileSync(path.join(profileDir,'package.json'),'{}')
  const patch=path.join(profileDir,'cordis.patch.yml')
  fs.writeFileSync(patch,'- insert:\n    - id: paperdock\n      name: paperdock-dsh-plugin\n# BEGIN dsh-session-delete-plugin\n'+SESSION_DELETE_PATCH+'- id: ui-theme\n  config:\n    preference: dark\n# END dsh-session-delete-plugin\n')
  fs.writeFileSync(patch,removeLegacyMount(fs.readFileSync(patch,'utf8')))
  assert.equal(removeLegacyMount(fs.readFileSync(patch,'utf8')),fs.readFileSync(patch,'utf8'))
  const warnings=[]
  const layers=['dsh-base','dsh-web-app'].map(name=>loadOverlayPatches('dsh',path.join(path.dirname(require.resolve('@deepseek-ai/'+name+'/package.json')),'cordis.patch.yml')))
  const entries=composeEntries([...layers,loadOverlayPatches('dsh',path.resolve(import.meta.dirname,'../cordis.patch.yml')),loadOverlayPatches('dsh',patch)],w=>warnings.push(w))
  const flatten=rows=>rows.flatMap(e=>[e,...(Array.isArray(e.config)?flatten(e.config):[])])
  const all=flatten(entries)
  assert.notEqual(all.find(e=>e.id==='session-controller').disabled,true)
  assert.notEqual(all.find(e=>e.id==='ui-workspace').disabled,true)
  assert.equal(all.find(e=>e.id==='ui-theme').config.preference,'dark')
  assert.equal(all.find(e=>e.id==='session-delete').name,'dsh-session-delete-plugin')
  assert.deepEqual(warnings,[])
 } finally {fs.rmSync(root,{recursive:true,force:true})}
})


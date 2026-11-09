import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const here = path.dirname(fileURLToPath(import.meta.url))
const dsh = process.env.DSH_INSTALL_DIR || (process.platform === 'win32' ? path.join(process.env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh') : null)
if (!dsh) throw new Error('Set DSH_INSTALL_DIR to the installed DSH package directory')
const modules = path.join(dsh, 'node_modules')
const version = JSON.parse(fs.readFileSync(path.join(dsh,'package.json'))).version
if(version !== '0.2.2-rc.1') throw new Error('This plugin targets DSH 0.2.2-rc.1; review compatibility before rebuilding for '+version)
const out=path.join(here,'lib');fs.mkdirSync(out,{recursive:true})
for(const file of ['host.mjs','delete.mjs','storage.mjs','client.js']) fs.copyFileSync(path.join(here,'src/v2',file),path.join(out,file))
const workspaceClient=fs.readFileSync(path.join(modules,'@deepseek-ai/dsh-client-ui-workspace/lib/client.js'),'utf8')
const dangerClass=workspaceClient.match(/"deleteAction": "([^"]+)"/)?.[1]
if(!dangerClass || !workspaceClient.includes('clearMain()')) throw new Error('Native workspace API changed')
const ui=fs.readFileSync(path.join(out,'client.js'),'utf8').replace("'session-delete-danger'",JSON.stringify(dangerClass))
fs.writeFileSync(path.join(out,'client.js'),ui)
const dependencies=['cordis','dsh-api-session-controller','dsh-session-persistence-jsonl','dsh-session-query-sqlite','dsh-workspace','dsh-session-projection-cache'].map(name=>['@deepseek-ai/'+name,'lib/index.js'])
dependencies.push(['@deepseek-ai/dsh-client-ui-workspace','lib/client.js'])
const compat=dependencies.map(([name,file])=>({package:name,file,sha256:createHash('sha256').update(fs.readFileSync(path.join(modules,name,file))).digest('hex')}))
fs.writeFileSync(path.join(out,'compat.json'),JSON.stringify(compat,null,2)+'\n')
console.log('Built session-delete-plugin for DSH '+version)

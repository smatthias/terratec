import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
const temporary=await mkdtemp(join(tmpdir(),'terratec-install-'));
let child;
try {
  const name=`terratec-${process.platform}-${process.arch}`;
  execFileSync('tar',['-xzf',resolve('release',name+'.tar.gz'),'-C',temporary]);
  const installation=join(temporary,name);
  // Run outside the extracted folder, without node_modules or repository paths.
  child=spawn(process.execPath,[join(installation,'start.mjs')],{cwd:tmpdir(),env:{...process.env,PORT:'3197',TERRATEC_DATA_DIR:join(temporary,'saved-data')},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);
  const base='http://127.0.0.1:3197';
  let ready=false;
  for(let i=0;i<100;i++) {if(child.exitCode!==null) throw new Error(log);try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,50));}
  assert.ok(ready,log);
  const html=await (await fetch(base)).text();assert.match(html,/<div id="app">/);
  for(const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)]) assert.equal((await fetch(base+asset[1])).status,200);
  assert.equal((await fetch(base+'/missing.js')).status,404);
  assert.equal((await fetch(base+'/server/index.mjs')).status,404);
  const fixture={schemaVersion:1,units:'m',name:'Installed studio',room:{width:6,depth:4,height:2.8}};
  const request={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(fixture)};
  const geometry=await fetch(base+'/api/geometry',request);assert.equal(geometry.status,200,await geometry.clone().text());assert.equal((await geometry.json()).area,24);
  const saved=await fetch(base+'/api/projects',request);assert.equal(saved.status,201);const record=await saved.json();
  assert.equal((await fetch(base+'/api/projects/'+record.id)).status,200);
  assert.ok((await readFile(join(temporary,'saved-data','projects',record.id+'.json'),'utf8')).includes('Installed studio'));
  console.log('Extracted release: HTML/assets, native geometry and persistent project API passed.');
} finally {if(child&&child.exitCode===null){child.kill();await once(child,'exit');}await rm(temporary,{recursive:true,force:true});}

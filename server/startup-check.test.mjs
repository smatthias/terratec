import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {startupConfig,checkStartup} from './startup-check.mjs';
async function setup(t){const dir=await mkdtemp(join(tmpdir(),'terratec-startup-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('startup rejects invalid ports and explicitly empty paths rather than using defaults',()=>{
 for(const PORT of ['', '0','65536','1.5',' 3001','-1','abc','1e3'])assert.throws(()=>startupConfig({PORT}),/PORT/);
 for(const key of ['TERRATEC_DATA_DIR','TERRATEC_CORE','TERRATEC_STATIC_DIR'])assert.throws(()=>startupConfig({[key]:' '}),new RegExp(key));
 const config=startupConfig({PORT:'65535',TERRATEC_DATA_DIR:'relative-data'});assert.equal(config.port,65535);assert.ok(isAbsolute(config.dataDir));assert.equal(config.staticDir,undefined);assert.ok(startupConfig({},{production:true}).staticDir.endsWith('/dist'));
});
test('startup verifies the real core, static entry and writable external storage',async t=>{
 const dir=await setup(t);await writeFile(join(dir,'index.html'),'<!doctype html><title>App</title>');
 const config=startupConfig({TERRATEC_DATA_DIR:join(dir,'data'),TERRATEC_STATIC_DIR:dir});assert.equal((await checkStartup(config)).status,'ok');
});
test('missing or invalid cores, missing static entry and unusable storage block startup',async t=>{
 const dir=await setup(t),file=join(dir,'occupied');await writeFile(file,'keep');
 const config=startupConfig({TERRATEC_DATA_DIR:file,TERRATEC_CORE:join(dir,'missing-core'),TERRATEC_STATIC_DIR:dir}),report=await checkStartup(config);
 assert.equal(report.status,'error');for(const code of ['CORE_UNAVAILABLE','STATIC_UNAVAILABLE'])assert.ok(report.issues.some(i=>i.code===code&&i.fatal));assert.equal(report.storage.writable,false);assert.equal(await readFile(file,'utf8'),'keep');
 const invalid=await checkStartup({...config,dataDir:join(dir,'data'),staticDir:undefined,corePath:process.execPath});assert.ok(invalid.issues.some(i=>i.code==='CORE_UNAVAILABLE'));
});
test('corrupt existing records warn without blocking recovery or overwriting records',async t=>{
 const dir=await setup(t);await mkdir(join(dir,'projects'));const file=join(dir,'projects','00000000-0000-4000-8000-000000000001.json');await writeFile(file,'{broken');
 const report=await checkStartup(startupConfig({TERRATEC_DATA_DIR:dir}));assert.equal(report.status,'attention');assert.ok(report.issues.every(i=>!i.fatal));assert.equal(await readFile(file,'utf8'),'{broken');
});

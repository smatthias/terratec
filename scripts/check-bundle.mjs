import assert from 'node:assert/strict';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
const root=resolve('dist'),manifest=JSON.parse(await readFile(resolve(root,'.vite/manifest.json'),'utf8'));
const entry=manifest['index.html'];assert.ok(entry?.isEntry,'Production entry missing');
const initial=new Set();
function visit(key){if(initial.has(key))return;const chunk=manifest[key];assert.ok(chunk,'Missing imported chunk '+key);initial.add(key);for(const imported of chunk.imports??[])visit(imported);}
visit('index.html');
const chunks=[];
for(const [key,chunk] of Object.entries(manifest)){
 const file=resolve(root,chunk.file);assert.ok(file.startsWith(root+'/'),'Asset outside dist');
 const bytes=await readFile(file);assert.ok(bytes.length<=400000,`${chunk.file} exceeds 400 kB chunk budget`);
 for(const css of chunk.css??[])assert.ok((await stat(resolve(root,css))).size<=15000,'CSS exceeds 15 kB budget');
 for(const imported of [...chunk.imports??[],...chunk.dynamicImports??[]])assert.ok(manifest[imported],'Missing manifest dependency '+imported);
 chunks.push({file:chunk.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,initial:initial.has(key)});
}
const entryBytes=chunks.find(c=>c.file===entry.file).bytes,initialBytes=chunks.filter(c=>c.initial).reduce((n,c)=>n+c.bytes,0),totalBytes=chunks.reduce((n,c)=>n+c.bytes,0);
assert.ok(entryBytes<=180000,'Entry exceeds 180 kB budget');assert.ok(initialBytes<=850000,'Initial JavaScript exceeds 850 kB budget');assert.ok(totalBytes<=950000,'Total JavaScript exceeds 950 kB budget');
for(const key of ['src/ManufacturingPanel.vue','src/WorkshopJobs.vue'])assert.ok(manifest[key]?.isDynamicEntry&&!initial.has(key),key+' must stay lazy');
await mkdir('test-results',{recursive:true});await writeFile('test-results/bundle-report.json',JSON.stringify({entryBytes,initialBytes,totalBytes,chunks},null,2)+'\n');
console.log(`Bundle budgets passed: entry ${(entryBytes/1000).toFixed(1)} kB, initial ${(initialBytes/1000).toFixed(1)} kB, total ${(totalBytes/1000).toFixed(1)} kB; ${chunks.length} chunks.`);

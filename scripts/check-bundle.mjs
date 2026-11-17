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
// The furniture designer perspective is budgeted on its own: it must stay lazy and
// within 80 kB, and the rest of the application keeps the 990 kB total (950 kB until CAM posts,
// holding tabs and design manufacturing, 975 kB until furniture snapping and auto-arrange).
const designerKey='src/DesignerWorkspace.vue',designer=manifest[designerKey];
assert.ok(designer?.isDynamicEntry&&!initial.has(designerKey),designerKey+' must stay lazy');
const designerBytes=chunks.find(c=>c.file===designer.file).bytes;
assert.ok(designerBytes<=80000,'Furniture designer exceeds 80 kB budget');
// The version-history panel likewise: lazy and within 12 kB (recording versions is part of the entry).
const historyKey='src/TimelinePanel.vue',historyPanel=manifest[historyKey];
assert.ok(historyPanel?.isDynamicEntry&&!initial.has(historyKey),historyKey+' must stay lazy');
const historyBytes=chunks.find(c=>c.file===historyPanel.file).bytes;
assert.ok(historyBytes<=12000,'Version history panel exceeds 12 kB budget');
// The drilling bench (a designer tool) likewise: lazy and within 25 kB.
const benchKey='src/DrillingBench.vue',bench=manifest[benchKey];
assert.ok(bench?.isDynamicEntry&&!initial.has(benchKey),benchKey+' must stay lazy');
const benchBytes=chunks.find(c=>c.file===bench.file).bytes;
assert.ok(benchBytes<=25000,'Drilling bench exceeds 25 kB budget');
const entryBytes=chunks.find(c=>c.file===entry.file).bytes,initialBytes=chunks.filter(c=>c.initial).reduce((n,c)=>n+c.bytes,0),totalBytes=chunks.reduce((n,c)=>n+c.bytes,0)-designerBytes-historyBytes-benchBytes;
assert.ok(entryBytes<=180000,'Entry exceeds 180 kB budget');assert.ok(initialBytes<=860000,'Initial JavaScript exceeds 860 kB budget');assert.ok(totalBytes<=990000,'Total JavaScript exceeds 990 kB budget');
for(const key of ['src/ManufacturingPanel.vue','src/WorkshopJobs.vue'])assert.ok(manifest[key]?.isDynamicEntry&&!initial.has(key),key+' must stay lazy');
await mkdir('test-results',{recursive:true});await writeFile('test-results/bundle-report.json',JSON.stringify({entryBytes,initialBytes,totalBytes,designerBytes,historyBytes,benchBytes,chunks},null,2)+'\n');
console.log(`Bundle budgets passed: entry ${(entryBytes/1000).toFixed(1)} kB, initial ${(initialBytes/1000).toFixed(1)} kB, total ${(totalBytes/1000).toFixed(1)} kB plus designer ${(designerBytes/1000).toFixed(1)} kB history panel ${(historyBytes/1000).toFixed(1)} kB and drilling bench ${(benchBytes/1000).toFixed(1)} kB; ${chunks.length} chunks.`);

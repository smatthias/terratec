import {test} from 'node:test';
import assert from 'node:assert/strict';
import {billingExchange,billingExchangeCsv} from './billing-exchange.mjs';
import * as D from './furniture-design-edit.mjs';
import {placedDesignItem} from './design-placement.mjs';
import {createJobManifest} from './job-manifest.mjs';
import {validateProject} from './project.mjs';
import {quoteCosting} from './quote.mjs';
const jobId='00000000-0000-4000-8000-000000000001',quoteId='00000000-0000-4000-8000-000000000002';
const pricing={currency:'EUR',sheetRates:{oak:10001,birch:20000,white:30000},handleUnitCents:251,labourHourlyCents:6011,labourMinutesPerPanel:7,markupBps:1250,edging:{materialCentsPerMetre:201,labourCentsPerMetre:303,wasteBps:1000}};
async function context(currency='EUR') {
 const source={schemaVersion:1,units:'m',name:'Source',room:{width:6,depth:4,height:3,furniture:[{id:'cabinet',name:'Cabinet',type:'cabinet',width:.9,height:1.2,depth:.5,thickness:.018,shelves:1,x:0,z:0,rotation:0,edgeBanding:{thicknessMm:2,fronts:true,shelves:true}}]}};const normalized=validateProject(source);normalized.room.furniture=source.room.furniture;const manifest=await createJobManifest(normalized,'2026-11-01T10:00:00Z');
 const quote={id:quoteId,createdAt:'2026-11-01T11:00:00Z',details:{customer:'Customer',reference:'Q-1',notes:'Saved terms',customerContact:'Berlin'},costing:quoteCosting(manifest,1,{...pricing,currency}),lifecycle:{status:'accepted',events:[{number:1,status:'sent',actor:'M',note:'Recorded',at:'2026-11-01T12:00:00Z'},{number:2,status:'accepted',actor:'M',note:'Recorded',at:'2026-11-01T13:00:00Z'}]}};
 return {jobId,jobName:'Kitchen',updatedAt:'2026-11-01T14:00:00Z',revision:{number:1,manifest,quotes:[quote]},quote};
}
test('billing lines reconcile exactly in cents and preserve source IDs and saved customer data',async()=>{
 for(const currency of ['EUR','USD','GBP']) {
  const input=await context(currency),before=structuredClone(input),e=await billingExchange(input,'2026-11-02T10:00:00Z');
  assert.equal(e.netCents,input.quote.costing.totalCents);assert.equal(e.lines.reduce((n,l)=>n+l.amountCents,0),e.netCents);assert.equal(e.currency,currency);assert.equal(e.source.sourceSha256,input.revision.manifest.sourceSha256);assert.equal(e.source.quoteId,quoteId);assert.equal(e.customer.customer,'Customer');assert.equal(e.invoiceNumber,null);assert.equal(e.tax.amountCents,null);
  assert.ok(e.lines.every(l=>Number.isSafeInteger(l.amountCents)));assert.ok(e.lines.some(l=>l.category==='edging-material'));assert.equal(e.lines.find(l=>l.category==='labour').ratePerUnits,60);assert.deepEqual(input,before);
  assert.equal((await billingExchange(input,'2026-11-03T10:00:00Z')).exportKey,e.exportKey);
  const restored={...input,jobId:'00000000-0000-4000-8000-000000000099'};assert.equal((await billingExchange(restored)).exportKey,e.exportKey);
 }
});
test('unaccepted quotes, missing saved customers and quotes outside the revision are rejected',async()=>{
 for(const status of ['draft','sent','declined','withdrawn']) {
  const c=await context();if(status==='draft')delete c.quote.lifecycle;else {c.quote.lifecycle.status=status;c.quote.lifecycle.events=c.quote.lifecycle.events.slice(0,status==='sent'?1:2);if(status!=='sent')c.quote.lifecycle.events[1].status=status;}
  await assert.rejects(()=>billingExchange(c),/accepted/);
 }
 const c=await context();c.quote.details.customer=' ';await assert.rejects(()=>billingExchange(c),/customer/);
 const other=await context();other.revision.quotes=[];await assert.rejects(()=>billingExchange(other),/saved snapshot/);
});
test('tampered saved amounts, model snapshots, lifecycle and identifiers block exchange',async()=>{
 const c=await context();c.quote.costing.totalCents++;await assert.rejects(()=>billingExchange(c),/amounts/);
 const model=await context();model.revision.manifest.source.name='Changed';await assert.rejects(()=>billingExchange(model),/integrity/);
 const life=await context();life.quote.lifecycle.events[1].at='2026-11-01T09:00:00Z';await assert.rejects(()=>billingExchange(life),/lifecycle/);
 const id=await context();id.jobId='bad';await assert.rejects(()=>billingExchange(id),/saved job/);
});
test('CSV preserves quoted multiline fields, neutralizes formulas and exports integer amounts',async()=>{
 const c=await context();c.jobName='=SUM(1,2)';c.quote.details.customer='  +Formula';c.quote.details.reference='@ref';c.quote.details.notes='Line 1,"quote"\nLine 2';c.quote.details.customerContact='\t=Command';
 const e=await billingExchange(c),csv=billingExchangeCsv(e);assert.ok(csv.startsWith('\uFEFF"export_key"'));assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('"\'+Formula"'));assert.ok(csv.includes('"\'@ref"'));assert.ok(csv.includes('"Line 1,""quote""\nLine 2"'));assert.ok(csv.includes('"\'=Command"'));assert.ok(csv.includes('"excluded-unspecified"'));assert.equal(e.customer.customer,'+Formula');assert.ok(csv.endsWith('\r\n'));
});

test('profile stock quantities retain millimetres and per-metre rates without rounding drift',async()=>{
 const c=await context();let n=0;let d=D.createDesign({id:'rod-design',name:'Rod',makeId:()=> 'r'+(++n)});({design:d}=D.addPart(d,'cylinder',{makeId:()=> 'r'+(++n),overrides:{axis:'x',diameter:20,length:701,x:0,y:0,z:0,material:'steel'}}));
 const source=c.revision.manifest.source,manifest=await createJobManifest({...source,schemaVersion:7,furnitureDesigns:[d],room:{...source.room,furniture:[...source.room.furniture,placedDesignItem(d,{id:'placed-rod',x:1,z:1})]}},c.revision.manifest.generatedAt);
 c.revision.manifest=manifest;c.quote.costing=quoteCosting(manifest,1,{...pricing,profileRates:Object.fromEntries(manifest.profiles.map(p=>[p.key,101]))});
 const e=await billingExchange(c),line=e.lines.find(l=>l.category==='profile');assert.equal(line.quantity,701);assert.equal(line.rateCents,101);assert.equal(line.ratePerUnits,1000);assert.equal(line.amountCents,71);assert.equal(e.lines.reduce((s,l)=>s+l.amountCents,0),e.netCents);
});

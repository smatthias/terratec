import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quoteCosting,moneyToCents,validatePricing} from './quote.mjs';
const pricing={currency:'EUR',sheetRates:{oak:10000,birch:20000,white:30000},handleUnitCents:250,labourHourlyCents:6000,labourMinutesPerPanel:5,markupBps:1250};
const manifest={sourceSha256:'hash',validation:{status:'review-required'},batches:[{number:1,material:'oak',thickness:.018,layout:{stock:{stockLengthMm:2440,stockWidthMm:1220},sheets:[{},{}]}}],summary:{panels:8},source:{room:{furniture:[{width:.9,depth:.5,height:1.2,thickness:.018,shelves:1}]}}};
test('costing uses whole sheet quantities, handles, labour and integer-cent markup',()=>{
  const cost=quoteCosting(manifest,2,pricing);assert.equal(cost.materialCents,20000);assert.equal(cost.hardwareCents,500);assert.equal(cost.labourCents,4000);assert.equal(cost.subtotalCents,24500);assert.equal(cost.markupCents,3063);assert.equal(cost.totalCents,27563);assert.equal(cost.revision,2);assert.equal(cost.sourceSha256,'hash');
  assert.equal(moneyToCents('12.34'),1234);assert.equal(moneyToCents('0.01'),1);
  for(const value of ['-1','1.234','1e3','NaN',''])assert.throws(()=>moneyToCents(value));
  for(const change of [{markupBps:10001},{labourMinutesPerPanel:.5},{handleUnitCents:-1},{currency:'XXX'}])assert.throws(()=>validatePricing({...pricing,...change}));
  assert.throws(()=>quoteCosting({...manifest,validation:{status:'blocked'}},1,pricing),/blockers/);
});
test('optional edging costs use saved geometry, material waste and net-length labour with cent rounding',()=>{
 const cabinet={...manifest.source.room.furniture[0],edgeBanding:{thicknessMm:2,fronts:true,shelves:true}};
 const input={...manifest,source:{room:{furniture:[cabinet]}}},rates={...pricing,edging:{materialCentsPerMetre:200,labourCentsPerMetre:300,wasteBps:1000}};
 const c=quoteCosting(input,1,rates);assert.deepEqual(c.edging,{netLengthMm:7236,purchaseLengthMm:7960,materialCents:1592,labourCents:2171,totalCents:3763});
 assert.equal(c.subtotalCents,24500+3763);assert.equal(c.markupCents,Math.round(c.subtotalCents*.125));assert.equal(c.totalCents,c.subtotalCents+c.markupCents);
 assert.equal('edging' in quoteCosting(input,1,pricing),false);assert.equal('edging' in validatePricing(pricing),false);
 const empty=quoteCosting(manifest,1,rates);assert.equal(empty.edging.totalCents,0);
 for(const edging of [null,{materialCentsPerMetre:-1,labourCentsPerMetre:0,wasteBps:0},{materialCentsPerMetre:1,labourCentsPerMetre:0,wasteBps:10001},{materialCentsPerMetre:1.5,labourCentsPerMetre:0,wasteBps:0}])assert.throws(()=>validatePricing({...pricing,edging}));
});

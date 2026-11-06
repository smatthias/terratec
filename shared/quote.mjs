import {cabinetBom} from './cabinet-parts.mjs';
export function validatePricing(input){
  if(!input||!['EUR','USD','GBP'].includes(input.currency))throw Error('Choose EUR, USD or GBP');
  const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
  if(!['oak','birch','white'].every(k=>integer(input.sheetRates?.[k],1000000))||!integer(input.handleUnitCents,1000000)||!integer(input.labourHourlyCents,1000000)||!integer(input.labourMinutesPerPanel,600)||!integer(input.markupBps,10000))throw Error('Invalid pricing: use non-negative integer cents, minutes (0–600) and markup basis points (0–10000)');
  return {currency:input.currency,sheetRates:{oak:input.sheetRates.oak,birch:input.sheetRates.birch,white:input.sheetRates.white},handleUnitCents:input.handleUnitCents,labourHourlyCents:input.labourHourlyCents,labourMinutesPerPanel:input.labourMinutesPerPanel,markupBps:input.markupBps};
}
export function quoteCosting(manifest,revision,input){
  const pricing=validatePricing(input);
  if(manifest.validation.status==='blocked')throw Error('Resolve handoff blockers before costing a quote');
  const lines=manifest.batches.map(b=>({batch:b.number,material:b.material,thicknessMm:b.thickness*1000,stockLengthMm:b.layout.stock.stockLengthMm,stockWidthMm:b.layout.stock.stockWidthMm,quantity:b.layout.sheets.length,unitCents:pricing.sheetRates[b.material],amountCents:b.layout.sheets.length*pricing.sheetRates[b.material]}));
  const materialCents=lines.reduce((n,l)=>n+l.amountCents,0);
  const handles=manifest.source.room.furniture.reduce((n,c)=>n+cabinetBom(c).handles,0),hardwareCents=handles*pricing.handleUnitCents;
  const labourMinutes=manifest.summary.panels*pricing.labourMinutesPerPanel,labourCents=Math.round(labourMinutes*pricing.labourHourlyCents/60);
  const subtotalCents=materialCents+hardwareCents+labourCents,markupCents=Math.round(subtotalCents*pricing.markupBps/10000);
  const totalCents=subtotalCents+markupCents;
  if(!Number.isSafeInteger(totalCents))throw Error('Quote total exceeds supported precision');
  return {version:1,sourceSha256:manifest.sourceSha256,revision,pricing,lines,handles,labourMinutes,materialCents,hardwareCents,labourCents,subtotalCents,markupCents,totalCents,taxIncluded:false};
}
export function moneyToCents(value){
  if(typeof value!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(value))throw Error('Enter prices with up to two decimals');
  const [major,minor='']=value.split('.');return Number(major)*100+Number(minor.padEnd(2,'0'));
}
export function validateQuoteDetails(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid quote details');
  const result={};
  for(const [field,max] of [['customer',120],['reference',80],['notes',1000]]){
    const value=input[field]??'';
    if(typeof value!=='string'||value.length>max)throw Error('Invalid quote '+field);
    result[field]=value.trim();
  }
  return result;
}

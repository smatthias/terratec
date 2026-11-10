import {stockRateKey,validateStockRates} from './stock-pricing.mjs';
import {cabinetBom} from './cabinet-parts.mjs';
export function validatePricing(input){
  if(!input||!['EUR','USD','GBP'].includes(input.currency))throw Error('Choose EUR, USD or GBP');
  const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
  if(!['oak','birch','white'].every(k=>integer(input.sheetRates?.[k],1000000))||!integer(input.handleUnitCents,1000000)||!integer(input.labourHourlyCents,1000000)||!integer(input.labourMinutesPerPanel,600)||!integer(input.markupBps,10000))throw Error('Invalid pricing: use non-negative integer cents, minutes (0–600) and markup basis points (0–10000)');
  let edging;
  if(input.edging!==undefined){
    const value=input.edging;
    if(!value||typeof value!=='object'||Array.isArray(value)||!integer(value.materialCentsPerMetre,1000000)||!integer(value.labourCentsPerMetre,1000000)||!integer(value.wasteBps,10000))throw Error('Invalid edging rates: use non-negative integer cents and waste basis points from 0 to 10000');
    edging={materialCentsPerMetre:value.materialCentsPerMetre,labourCentsPerMetre:value.labourCentsPerMetre,wasteBps:value.wasteBps};
  }
  return {...(input.stockRates!==undefined?{stockRates:validateStockRates(input.stockRates)}:{}),...(edging?{edging}:{}),currency:input.currency,sheetRates:{oak:input.sheetRates.oak,birch:input.sheetRates.birch,white:input.sheetRates.white},handleUnitCents:input.handleUnitCents,labourHourlyCents:input.labourHourlyCents,labourMinutesPerPanel:input.labourMinutesPerPanel,markupBps:input.markupBps};
}
export function quoteCosting(manifest,revision,input){
  const pricing=validatePricing(input);
  if(manifest.validation.status==='blocked')throw Error('Resolve handoff blockers before costing a quote');
  const lines=manifest.batches.map(b=>{
    const dimensions={material:b.material,thicknessMm:b.thickness*1000,stockLengthMm:b.layout.stock.stockLengthMm,stockWidthMm:b.layout.stock.stockWidthMm};
    const override=pricing.stockRates?.find(row=>stockRateKey(row)===stockRateKey(dimensions)),unitCents=override?.unitCents??pricing.sheetRates[b.material];
    return {batch:b.number,...dimensions,quantity:b.layout.sheets.length,unitCents,amountCents:b.layout.sheets.length*unitCents,...(pricing.stockRates!==undefined?{rateSource:override?'stock':'material'}:{})};
  });
  const materialCents=lines.reduce((n,l)=>n+l.amountCents,0);
  const handles=manifest.source.room.furniture.reduce((n,c)=>n+cabinetBom(c).handles,0),hardwareCents=handles*pricing.handleUnitCents;
  const labourMinutes=manifest.summary.panels*pricing.labourMinutesPerPanel,labourCents=Math.round(labourMinutes*pricing.labourHourlyCents/60);
  let edging;
  if(pricing.edging){
    const netLengthMm=Math.round(manifest.source.room.furniture.reduce((sum,item)=>sum+cabinetBom(item).rows.reduce((n,row)=>n+row.bandLengthMetres,0),0)*1000);
    const purchaseLengthMm=Math.ceil(netLengthMm*(10000+pricing.edging.wasteBps)/10000);
    const materialCents=Math.round(purchaseLengthMm*pricing.edging.materialCentsPerMetre/1000),labourCents=Math.round(netLengthMm*pricing.edging.labourCentsPerMetre/1000);
    edging={netLengthMm,purchaseLengthMm,materialCents,labourCents,totalCents:materialCents+labourCents};
  }
  const subtotalCents=materialCents+hardwareCents+labourCents+(edging?.totalCents??0),markupCents=Math.round(subtotalCents*pricing.markupBps/10000);
  const totalCents=subtotalCents+markupCents;
  if(!Number.isSafeInteger(totalCents))throw Error('Quote total exceeds supported precision');
  return {...(edging?{edging}:{}),version:1,sourceSha256:manifest.sourceSha256,revision,pricing,lines,handles,labourMinutes,materialCents,hardwareCents,labourCents,subtotalCents,markupCents,totalCents,taxIncluded:false};
}
export function moneyToCents(value){
  if(typeof value!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(value))throw Error('Enter prices with up to two decimals');
  const [major,minor='']=value.split('.');return Number(major)*100+Number(minor.padEnd(2,'0'));
}
export function validateQuoteDetails(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid quote details');
  const result={};
  for(const [field,max] of [['customer',120],['reference',80],['notes',1000],['customerContact',1000],['customerId',64]]){
    const value=input[field]??'';
    if(typeof value!=='string'||value.length>max)throw Error('Invalid quote '+field);
    result[field]=value.trim();
  }
  if(result.customerId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.customerId))throw Error('Invalid quote customer ID');
  return result;
}

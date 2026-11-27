import {quoteCosting,validateQuoteDetails} from './quote.mjs';
import {validateQuoteLifecycle} from './quote-lifecycle.mjs';
import {verifyJobManifest} from './job-manifest.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function billingExchange({jobId,jobName,updatedAt,revision,quote},generatedAt=new Date().toISOString()) {
  if(!uuid(jobId)||typeof jobName!=='string'||!jobName.trim()||jobName.length>80||!Number.isInteger(revision?.number)||revision.number<1||!uuid(quote?.id))throw Error('Billing exchange requires a saved job, revision and quote');
  if(!Number.isFinite(Date.parse(quote.createdAt))||!Number.isFinite(Date.parse(updatedAt))||!Number.isFinite(Date.parse(generatedAt)))throw Error('Invalid billing snapshot date');
  if(!revision.quotes?.some(saved=>saved.id===quote.id&&JSON.stringify(canonical(saved))===JSON.stringify(canonical(quote))))throw Error('Billing quote is not the saved snapshot of this revision');
  validateQuoteLifecycle(quote,updatedAt);
  if(quote.lifecycle?.status!=='accepted')throw Error('Record the saved quote as accepted before billing exchange');
  const details=validateQuoteDetails(quote.details);if(!details.customer)throw Error('The saved quote needs a customer before billing exchange');
  await verifyJobManifest(JSON.stringify(revision.manifest),revision.manifest?.source);
  const c=quoteCosting(revision.manifest,revision.number,quote.costing?.pricing);
  if(JSON.stringify(canonical(c))!==JSON.stringify(canonical(quote.costing)))throw Error('Saved quote amounts do not match its revision; billing exchange blocked');
  const lines=[],add=(category,description,quantity,unit,rateCents,ratePerUnits,amountCents)=>lines.push({number:lines.length+1,category,description,quantity,unit,rateCents,ratePerUnits,amountCents});
  for(const line of c.lines)add('sheet',`Batch ${line.batch} · ${line.material} · ${line.thicknessMm} mm · ${line.stockLengthMm} × ${line.stockWidthMm} mm`,line.quantity,'sheet',line.unitCents,1,line.amountCents);
  add('hardware','Handles',c.handles,'handle',c.pricing.handleUnitCents,1,c.hardwareCents);
  add('labour','Estimated panel/profile labour',c.labourMinutes,'minute',c.pricing.labourHourlyCents,60,c.labourCents);
  for(const line of c.profiles?.lines??[])add('profile',line.label,line.lengthMm,'mm',line.centsPerMetre,1000,line.amountCents);
  if(c.edging){add('edging-material','Edging including material waste',c.edging.purchaseLengthMm,'mm',c.pricing.edging.materialCentsPerMetre,1000,c.edging.materialCents);add('edging-labour','Edging labour',c.edging.netLengthMm,'mm',c.pricing.edging.labourCentsPerMetre,1000,c.edging.labourCents);}
  add('markup',`Markup ${c.pricing.markupBps/100}%`,1,'lot',c.markupCents,1,c.markupCents);
  if(lines.reduce((sum,line)=>sum+line.amountCents,0)!==c.totalCents)throw Error('Billing lines do not reconcile to the saved total');
  return {format:'terratec-billing-exchange',version:1,generatedAt,exportKey:`terratec:quote:${quote.id}`,documentKind:'billing-handoff',currency:c.pricing.currency,
    source:{jobId,jobName,revision:revision.number,quoteId:quote.id,quoteCreatedAt:quote.createdAt,acceptedAt:quote.lifecycle.events.at(-1).at,sourceSha256:c.sourceSha256},
    customer:details,lines,subtotalCents:c.subtotalCents,markupCents:c.markupCents,netCents:c.totalCents,tax:{status:'excluded-unspecified',amountCents:null},invoiceNumber:null,
    note:'Accepted planning quote handoff. No invoice number, tax, delivery or payment entry is created. Amounts are integer minor units; rateCents applies per ratePerUnits of the line unit. Deduplicate by exportKey.'};
}
// Text fields are quoted and formula-neutralized for spreadsheet consumers.
const cell=value=>'"'+String(value??'').replace(/^(?=[\s\u0000-\u001f]*[=+\-@])|^(?=[\t\r\n])/u,"'").replace(/"/g,'""')+'"';
export function billingExchangeCsv(exchange) {
  if(exchange?.format!=='terratec-billing-exchange'||exchange.version!==1)throw Error('Unsupported billing exchange');
  const headers=['export_key','document_kind','job_id','job_name','revision','quote_id','source_sha256','customer_id','customer','customer_contact','reference','notes','currency','tax_status','line','category','description','quantity','unit','rate_cents','rate_per_units','line_net_cents'];
  const s=exchange.source,c=exchange.customer;
  const rows=exchange.lines.map(l=>[exchange.exportKey,exchange.documentKind,s.jobId,s.jobName,s.revision,s.quoteId,s.sourceSha256,c.customerId,c.customer,c.customerContact,c.reference,c.notes,exchange.currency,exchange.tax.status,l.number,l.category,l.description,l.quantity,l.unit,l.rateCents,l.ratePerUnits,l.amountCents]);
  return '\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

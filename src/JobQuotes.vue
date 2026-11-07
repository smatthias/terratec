<script setup>
import CustomerRecords from './CustomerRecords.vue';
import {ref,computed,watch} from 'vue';
import {printableQuote} from '../shared/quote-print.mjs';
import {quoteCosting,moneyToCents,validateQuoteDetails} from '../shared/quote.mjs';
const props=defineProps({revision:{type:Object,required:true},busy:Boolean,jobName:{type:String,default:''},focusId:{type:String,default:''}}),emit=defineEmits(['save','export','print','status']);
const statusActor=ref(''),statusNote=ref('');
function setStatus(status){emit('status',{quoteId:saved.value.id,status,expectedEvent:saved.value.lifecycle?.events.length??0,actor:statusActor.value,note:statusNote.value});}
const details=ref({customer:'',reference:'',notes:''});
const currency=ref('EUR'),rates=ref({oak:'0.00',birch:'0.00',white:'0.00',handles:'0.00',labour:'0.00'}),minutes=ref(0),markup=ref(0),choice=ref('');
const pricing=()=>{if(typeof markup.value!=='number'||!Number.isFinite(markup.value)||markup.value<0||markup.value>100||Math.abs(markup.value*100-Math.round(markup.value*100))>1e-6)throw Error('Enter markup from 0 to 100 with up to two decimals');return {currency:currency.value,sheetRates:{oak:moneyToCents(rates.value.oak),birch:moneyToCents(rates.value.birch),white:moneyToCents(rates.value.white)},handleUnitCents:moneyToCents(rates.value.handles),labourHourlyCents:moneyToCents(rates.value.labour),labourMinutesPerPanel:minutes.value,markupBps:Math.round(markup.value*100)};};
const preview=computed(()=>{try{validateQuoteDetails(details.value);return {cost:quoteCosting(props.revision.manifest,props.revision.number,pricing())};}catch(e){return {error:e.message};}});
const saved=computed(()=>props.revision.quotes?.find(q=>q.id===choice.value));
watch(()=>props.revision.quotes,(quotes,previous)=>{if(quotes?.length&&(previous?.length!==quotes.length||!quotes.some(q=>q.id===choice.value)))choice.value=quotes.at(-1).id;},{deep:true,immediate:true});
watch(()=>props.focusId,id=>{if(props.revision.quotes?.some(q=>q.id===id))choice.value=id;},{immediate:true});
const amount=(cents,code=currency.value)=>(cents/100).toFixed(2)+' '+code;
</script>
<template>
  <section aria-label="Revision costing" class="job-quotes"><h4>Revision costing</h4>
    <p class="hint">User-entered planning rates. One sheet rate per material applies across all sizes and thicknesses. Whole stock sheets, handles and estimated labour are costed; tax, delivery, joinery and other services are excluded. Markup applies to the subtotal. Zero is allowed; no supplier prices are supplied.</p>
    <fieldset :disabled="busy"><CustomerRecords @choose="details={...details,...$event}"/><label>Quote recipient contact<textarea v-model="details.customerContact" maxlength="1000"></textarea></label><label>Quote customer<input v-model="details.customer" maxlength="120"></label><label>Quote reference<input v-model="details.reference" maxlength="80"></label><label>Quote notes<textarea v-model="details.notes" maxlength="1000"></textarea></label><label>Quote currency<select v-model="currency" aria-label="Quote currency"><option>EUR</option><option>USD</option><option>GBP</option></select></label>
      <label v-for="material in ['oak','birch','white']" :key="material">{{ material }} sheet price<input v-model="rates[material]" inputmode="decimal"></label>
      <label>Handle unit price<input v-model="rates.handles" inputmode="decimal"></label><label>Labour hourly price<input v-model="rates.labour" inputmode="decimal"></label>
      <label>Labour minutes per panel<input v-model.number="minutes" type="number" min="0" max="600" step="1"></label><label>Quote markup percent<input v-model.number="markup" type="number" min="0" max="100" step="0.01"></label>
      <p v-if="preview.error" role="status">{{ preview.error }}</p>
      <template v-if="preview.cost"><p>Materials {{ amount(preview.cost.materialCents) }} · handles {{ preview.cost.handles }} · labour {{ preview.cost.labourMinutes }} minutes</p><p data-testid="quote-preview">Subtotal {{ amount(preview.cost.subtotalCents) }} · markup {{ amount(preview.cost.markupCents) }} · total {{ amount(preview.cost.totalCents) }} (tax excluded)</p></template>
      <button :disabled="!preview.cost" @click="emit('save',{pricing:pricing(),details:validateQuoteDetails(details)})">Save revision quote snapshot</button>
      <label v-if="revision.quotes?.length">Saved quote<select v-model="choice" aria-label="Saved quote"><option v-for="(q,index) in revision.quotes" :key="q.id" :value="q.id">Quote {{ index+1 }} · {{ amount(q.costing.totalCents,q.costing.pricing.currency) }}</option></select></label>
      <template v-if="saved"><p data-testid="saved-quote">Saved total {{ amount(saved.costing.totalCents,saved.costing.pricing.currency) }} · revision {{ saved.costing.revision }} · {{ saved.createdAt }}</p><button @click="emit('export',JSON.stringify({format:'terratec-quote',version:1,...saved},null,2)+'\n')">Export saved quote JSON</button><button @click="emit('print',printableQuote(saved,jobName))">Export printable quote</button><p data-testid="quote-status">Quote status: {{ saved.lifecycle?.status || 'draft' }}</p><ol v-if="saved.lifecycle"><li v-for="event in saved.lifecycle.events" :key="event.number">{{ event.status }} · {{ event.actor }} · {{ event.at }} · {{ event.note }}</li></ol><template v-if="!saved.lifecycle||saved.lifecycle.status==='sent'"><label>Quote status actor<input v-model="statusActor" maxlength="80"></label><label>Quote status note<textarea v-model="statusNote" maxlength="1000"></textarea></label><button v-if="!saved.lifecycle" :disabled="!statusActor.trim()||!statusNote.trim()" @click="setStatus('sent')">Record quote as sent</button><template v-else><button v-for="state in ['accepted','declined','withdrawn']" :key="state" :disabled="!statusActor.trim()||!statusNote.trim()" @click="setStatus(state)">Record quote as {{ state }}</button></template></template><p class="hint">Status is a local record only. It sends no quote and does not capture authenticated customer acceptance.</p><p v-if="saved.details" data-testid="saved-quote-details">{{ saved.details.customer }} · {{ saved.details.reference }} · {{ saved.details.notes }}</p></template>
    </fieldset>
  </section>
</template>

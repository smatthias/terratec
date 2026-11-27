<script setup>
import {computed,ref} from 'vue';
import {billingExchange,billingExchangeCsv} from '../shared/billing-exchange.mjs';
const props=defineProps({context:{type:Object,required:true}}),busy=ref(false),message=ref('');
const eligible=computed(()=>props.context.quote.lifecycle?.status==='accepted'&&!!props.context.quote.details?.customer?.trim());
async function download(format){if(busy.value)return;busy.value=true;try{
  const snapshot=JSON.parse(JSON.stringify(props.context)),exchange=await billingExchange(snapshot),text=format==='csv'?billingExchangeCsv(exchange):JSON.stringify(exchange,null,2)+'\n';
  const url=URL.createObjectURL(new Blob([text],{type:format==='csv'?'text/csv;charset=utf-8':'application/json'})),link=document.createElement('a');link.href=url;link.download='terratec-billing-'+exchange.source.quoteId+'.'+format;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.value='Billing exchange exported: '+format.toUpperCase();
}catch(error){message.value=error.message;}finally{busy.value=false;}}
</script>
<template>
  <section aria-label="Billing exchange"><h5>Billing exchange</h5><p class="hint">Export the accepted saved quote for a billing-system adapter. Integer minor units, exact saved totals and stable source IDs are included. Tax and invoice numbering remain unset; this creates no invoice or payment entry.</p>
    <p v-if="!eligible">Record an accepted quote with a saved customer to enable billing exchange.</p>
    <button :disabled="busy||!eligible" @click="download('json')">Export billing JSON</button><button :disabled="busy||!eligible" @click="download('csv')">Export billing CSV</button><p data-testid="billing-message" role="status">{{ message }}</p>
  </section>
</template>

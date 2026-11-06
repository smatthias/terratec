<script setup>
import {ref,onMounted} from 'vue';
const emit=defineEmits(['choose']),customers=ref([]),choice=ref(''),editId=ref(''),version=ref(0),busy=ref(false),message=ref('');
const blank=()=>({name:'',email:'',phone:'',address:'',notes:''}),draft=ref(blank());
async function request(path,method='GET',body){const r=await fetch(path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(value.error);return value;}
async function run(action){busy.value=true;try{await action();}catch(e){message.value=e.message;}finally{busy.value=false;}}
async function refresh(){customers.value=await request('/api/customers');}
function edit(){const c=customers.value.find(c=>c.id===choice.value);if(!c)return;editId.value=c.id;version.value=c.version;draft.value={...c};}
function save(){return run(async()=>{const c=await request('/api/customers'+(editId.value?'/'+editId.value:''),editId.value?'PUT':'POST',{...draft.value,expectedVersion:version.value});choice.value=c.id;editId.value=c.id;version.value=c.version;await refresh();message.value='Customer record saved';});}
function choose(){const c=customers.value.find(c=>c.id===choice.value);if(c)emit('choose',{customer:c.name,customerId:c.id,customerContact:[c.email,c.phone,c.address].filter(Boolean).join('\n')});}
onMounted(()=>run(refresh));
</script>
<template><section aria-label="Customer records"><h4>Customer records</h4><fieldset :disabled="busy"><label v-if="customers.length">Saved customer<select v-model="choice" aria-label="Saved customer"><option value="">Choose customer</option><option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><button :disabled="!choice" @click="choose">Use customer in quote</button><button :disabled="!choice" @click="edit">Edit customer record</button><button @click="editId='';draft=blank();version=0">New customer record</button><label v-for="field in ['name','email','phone','address','notes']" :key="field">Customer {{ field }}<input v-model="draft[field]" :maxlength="{name:120,email:254,phone:50,address:500,notes:1000}[field]"></label><button :disabled="!draft.name.trim()" @click="save">Save customer record</button><button @click="run(refresh)">Refresh customers</button></fieldset><p data-testid="customer-message" role="status">{{ message }}</p><p class="hint">Local contact records. Use copies name and contact details into this quote draft; later customer edits leave saved quotes unchanged. No messages are sent.</p></section></template>

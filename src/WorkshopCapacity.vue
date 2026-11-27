<script setup>
import {ref,computed,onMounted} from 'vue';
import {validateWorkshopCapacity,workshopCapacityPlan} from '../shared/workshop-capacity.mjs';
const props=defineProps({jobs:{type:Array,required:true},candidate:{type:Object,default:null}});
const saved=ref([]),draft=ref([]),revision=ref(0),ready=ref(false),busy=ref(false),message=ref(''),name=ref(''),sheets=ref(8);
const plan=computed(()=>workshopCapacityPlan(props.jobs,saved.value,props.candidate));
async function request(body){const response=await fetch('/api/workshops/capacity',body?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),data=await response.json();if(!response.ok)throw Error(data.error);return data;}
async function run(action){if(busy.value)return;busy.value=true;try{await action();}catch(error){message.value=error.message;}finally{busy.value=false;}}
function accept(data){saved.value=data.workshops;draft.value=structuredClone(data.workshops);revision.value=data.revision;ready.value=true;}
const load=()=>run(async()=>{accept(await request());message.value='Workshop capacity loaded';});
function add(){try{draft.value=validateWorkshopCapacity([...draft.value,{name:name.value,sheetsPerDay:sheets.value}]);name.value='';message.value='Capacity added to draft; save to apply';}catch(error){message.value=error.message;}}
const save=()=>run(async()=>{const workshops=validateWorkshopCapacity(draft.value);accept(await request({expectedRevision:revision.value,workshops}));message.value='Workshop capacity saved';});
onMounted(load);
</script>
<template>
  <section aria-label="Workshop capacity planning">
    <h4>Workshop capacity planning</h4>
    <p class="hint">Advisory sheet capacity by due date. Assigned and in-production jobs reserve all sheets on their due date. Completed and cancelled jobs are excluded. This does not estimate hours, working days or machine availability.</p>
    <fieldset :disabled="busy||!ready"><legend>Daily sheet limits</legend>
      <label>Capacity workshop name<input v-model="name" maxlength="80"></label><label>Daily sheet capacity<input v-model.number="sheets" type="number" min="1" max="10000" step="1"></label><button type="button" @click="add">Add capacity draft</button>
      <ul><li v-for="(entry,index) in draft" :key="index"><strong>{{ entry.name }}</strong><input v-model.number="entry.sheetsPerDay" type="number" min="1" max="10000" step="1" :aria-label="entry.name+' daily sheet capacity'"><button type="button" :aria-label="'Remove capacity '+entry.name" @click="draft.splice(index,1)">Remove</button></li></ul>
      <button type="button" @click="save">Save workshop capacity</button>
    </fieldset>
    <button type="button" :disabled="busy" @click="load">Reload workshop capacity</button><p role="status" data-testid="capacity-message">{{ message }}</p>
    <template v-if="ready"><p class="hint">The table uses saved limits and all loaded jobs, regardless of register filters. Proposed assignment rows are previews only. Undated work has no utilization percentage. Names match without case or surrounding spaces. Reload jobs to include changes made elsewhere.</p>
      <article v-for="group in plan" :key="group.name"><h5>{{ group.name }} · {{ group.sheetsPerDay??'unknown' }} sheets/day</h5>
        <p v-if="!group.days.length">No active sheet reservations.</p>
        <table v-else><thead><tr><th>Due date</th><th>Jobs</th><th>Sheets</th><th>Utilization</th><th>Status</th></tr></thead><tbody><tr v-for="day in group.days" :key="day.date" data-testid="capacity-row"><td>{{ day.date||'No due date' }}</td><td>{{ day.jobs }}</td><td>{{ day.sheets }}{{ day.proposedSheets?' (includes '+day.proposedSheets+' proposed)':'' }}</td><td>{{ day.utilization===null?'Unknown':day.utilization+'%' }}</td><td>{{ !day.date?'Unscheduled':group.sheetsPerDay===null?'Capacity not set':day.overbooked?'Over capacity':'Within capacity' }}</td></tr></tbody></table>
      </article><p v-if="!plan.length">Add a capacity limit or assign a workshop job to see reservations.</p>
    </template>
  </section>
</template>

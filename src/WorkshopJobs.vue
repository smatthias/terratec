<script setup>
import {ref,onMounted,watch} from 'vue';
import {verifyJobManifest} from '../shared/job-manifest.mjs';
const props=defineProps({project:{type:Object,required:true}}),emit=defineEmits(['export']);
const jobs=ref([]),choice=ref(''),record=ref(null),revision=ref(1),name=ref(''),reviewer=ref(''),note=ref(''),message=ref(''),busy=ref(false),comparison=ref('');
const selected=()=>record.value?.revisions.find(r=>r.number===revision.value);
watch(()=>props.project,()=>comparison.value='',{deep:true});
async function request(path,body){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
async function refresh(){jobs.value=await request('/api/jobs');}
async function run(action){busy.value=true;try{await action();}catch(e){message.value=e.message;}finally{busy.value=false;}}
function load(){return run(async()=>{record.value=await request('/api/jobs/'+choice.value);revision.value=record.value.revisions.length;comparison.value='';message.value='Workshop job opened';});}
function create(){return run(async()=>{record.value=await request('/api/jobs',{name:name.value,project:props.project});choice.value=record.value.id;revision.value=1;await refresh();message.value='Workshop job created';});}
function revise(){return run(async()=>{record.value=await request('/api/jobs/'+record.value.id+'/revisions',{project:props.project,expectedRevision:record.value.revisions.length});revision.value=record.value.revisions.length;comparison.value='';await refresh();message.value='Workshop job revision saved';});}
function review(){return run(async()=>{record.value=await request('/api/jobs/'+record.value.id+'/review',{revision:revision.value,expectedRevision:record.value.revisions.length,reviewer:reviewer.value,note:note.value});await refresh();message.value='Workshop revision marked reviewed';});}
function compare(){return run(async()=>{const snapshot=JSON.stringify(props.project),result=await verifyJobManifest(JSON.stringify(selected().manifest),JSON.parse(snapshot));comparison.value=result.matchesCurrent&&snapshot===JSON.stringify(props.project)?'Revision matches current project':'Revision differs from current project';});}
onMounted(()=>run(refresh));
</script>
<template>
  <section aria-label="Workshop job records" class="workshop-jobs">
    <h3>Workshop job records</h3><p class="hint">Stored by this local service, independently of project saves. Revisions keep immutable model snapshots. Reviewed records document a local review, not production approval.</p>
    <fieldset :disabled="busy"><label>Workshop job name<input v-model="name" maxlength="80"></label><button :disabled="!name.trim()" @click="create">Create workshop job</button>
    <button @click="run(refresh)">Refresh workshop jobs</button>
    <label v-if="jobs.length">Workshop job<select v-model="choice" aria-label="Workshop job"><option value="">Choose job</option><option v-for="job in jobs" :key="job.id" :value="job.id">{{ job.name }} · r{{ job.revision }} · {{ job.status }}</option></select></label><button :disabled="!choice" @click="load">Open workshop job</button>
    <template v-if="record"><h4>{{ record.name }}</h4><label>Job revision<select v-model.number="revision" aria-label="Job revision" @change="comparison='' "><option v-for="r in record.revisions" :key="r.number" :value="r.number">Revision {{ r.number }} · {{ r.status }}</option></select></label>
      <p data-testid="job-record-status">Revision {{ revision }} · {{ selected().status }} · {{ selected().manifest.validation.status }}</p>
      <p class="hint job-hash">Source {{ selected().manifest.sourceSha256 }}</p>
      <button @click="compare">Compare job revision</button><p v-if="comparison" data-testid="job-comparison">{{ comparison }}</p>
      <button @click="emit('export',JSON.stringify(selected().manifest,null,2)+'\n')">Export saved job revision</button>
      <button @click="revise">Save current model as new revision</button>
      <p v-if="selected().review">Reviewed by {{ selected().review.reviewer }} · {{ selected().review.reviewedAt }} · {{ selected().review.note }}</p>
      <template v-if="revision===record.revisions.length&&selected().status==='planned'"><label>Review name<input v-model="reviewer" maxlength="80"></label><label>Review notes<textarea v-model="note" maxlength="1000"></textarea></label><button :disabled="!reviewer.trim()||!note.trim()||selected().manifest.validation.status==='blocked'" @click="review">Mark revision reviewed</button></template>
    </template></fieldset><p role="status" data-testid="job-record-message">{{ message }}</p>
  </section>
</template>

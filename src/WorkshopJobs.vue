<script setup>
import {ref,onMounted,watch} from 'vue';
import {exportJobBackup,MAX_JOB_BACKUP_BYTES} from '../shared/job-backup.mjs';
import {verifyJobManifest} from '../shared/job-manifest.mjs';
const props=defineProps({project:{type:Object,required:true}}),emit=defineEmits(['export','record']);
const jobs=ref([]),choice=ref(''),record=ref(null),revision=ref(1),name=ref(''),reviewer=ref(''),note=ref(''),message=ref(''),busy=ref(false),comparison=ref('');
const workshop=ref(''),dueDate=ref(''),actor=ref(''),trackingNote=ref('');
function fulfil(status){return run(async()=>{record.value=await request('/api/jobs/'+record.value.id+'/fulfilment',{revision:revision.value,expectedRevision:record.value.revisions.length,expectedEvent:selected().fulfilment?.events.length??0,status,workshop:workshop.value,dueDate:dueDate.value,actor:actor.value,note:trackingNote.value});await refresh();message.value='Workshop progress recorded: '+status;});}
function backup(){return run(async()=>emit('record',await exportJobBackup(record.value)));}
function restoreFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;return run(async()=>{if(file.size>MAX_JOB_BACKUP_BYTES)throw Error('Job backup exceeds 16 MiB');const input=JSON.parse(await file.text());const restored=await request('/api/jobs/restore',input);record.value=restored;choice.value=restored.id;revision.value=restored.revisions.length;comparison.value='';await refresh();message.value='Workshop job restored as a new local record';});}
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
    <label>Restore workshop job backup<input type="file" accept=".json,application/json" aria-label="Restore workshop job backup file" @change="restoreFile"></label><p class="hint">Restore verifies all snapshots and history, creates a new job ID and renames name conflicts. Existing jobs stay intact. Restored review/tracking claims are not authenticated.</p><button @click="run(refresh)">Refresh workshop jobs</button>
    <label v-if="jobs.length">Workshop job<select v-model="choice" aria-label="Workshop job"><option value="">Choose job</option><option v-for="job in jobs" :key="job.id" :value="job.id">{{ job.name }} · r{{ job.revision }} · {{ job.status }}</option></select></label><button :disabled="!choice" @click="load">Open workshop job</button>
    <template v-if="record"><h4>{{ record.name }}</h4><p v-if="record.restoredFrom" class="hint job-hash">Restored copy from {{ record.restoredFrom.id }} · {{ record.restoredFrom.restoredAt }}</p><label>Job revision<select v-model.number="revision" aria-label="Job revision" @change="comparison='' "><option v-for="r in record.revisions" :key="r.number" :value="r.number">Revision {{ r.number }} · {{ r.status }}</option></select></label>
      <p data-testid="job-record-status">Revision {{ revision }} · {{ selected().status }} · {{ selected().manifest.validation.status }}</p>
      <p class="hint job-hash">Source {{ selected().manifest.sourceSha256 }}</p>
      <button @click="compare">Compare job revision</button><p v-if="comparison" data-testid="job-comparison">{{ comparison }}</p>
      <button @click="emit('export',JSON.stringify(selected().manifest,null,2)+'\n')">Export saved job revision</button>
      <button @click="backup">Export workshop job record</button>
      <button @click="revise">Save current model as new revision</button>
      <p v-if="selected().review">Reviewed by {{ selected().review.reviewer }} · {{ selected().review.reviewedAt }} · {{ selected().review.note }}</p>
      <template v-if="revision===record.revisions.length&&selected().status==='planned'"><label>Review name<input v-model="reviewer" maxlength="80"></label><label>Review notes<textarea v-model="note" maxlength="1000"></textarea></label><button :disabled="!reviewer.trim()||!note.trim()||selected().manifest.validation.status==='blocked'" @click="review">Mark revision reviewed</button></template>
      <section v-if="selected().fulfilment" aria-label="Workshop fulfilment">
        <p data-testid="fulfilment-status">{{ selected().fulfilment.workshop }} · {{ selected().fulfilment.status }} · due {{ selected().fulfilment.dueDate || 'not set' }}</p>
        <ol><li v-for="event in selected().fulfilment.events" :key="event.number">{{ event.status }} · {{ event.at }} · {{ event.actor }} · {{ event.note }}</li></ol>
      </section>
      <template v-if="revision===record.revisions.length&&selected().status==='reviewed'&&(!selected().fulfilment||['assigned','in-production'].includes(selected().fulfilment.status))">
        <p class="hint">Local tracking only. Assignment does not contact a workshop or send machine instructions. Close an active assignment before creating another model revision.</p>
        <label>Tracking actor<input v-model="actor" maxlength="80"></label><label>Tracking notes<textarea v-model="trackingNote" maxlength="1000"></textarea></label>
        <template v-if="!selected().fulfilment"><label>Assigned workshop<input v-model="workshop" maxlength="80"></label><label>Workshop due date<input v-model="dueDate" type="date"></label><button :disabled="!actor.trim()||!trackingNote.trim()||!workshop.trim()" @click="fulfil('assigned')">Assign workshop</button></template>
        <template v-else><button v-if="selected().fulfilment.status==='assigned'" :disabled="!actor.trim()||!trackingNote.trim()" @click="fulfil('in-production')">Start production tracking</button><button v-if="selected().fulfilment.status==='in-production'" :disabled="!actor.trim()||!trackingNote.trim()" @click="fulfil('completed')">Mark workshop completed</button><button :disabled="!actor.trim()||!trackingNote.trim()" @click="fulfil('cancelled')">Cancel workshop assignment</button></template>
      </template>
    </template></fieldset><p role="status" data-testid="job-record-message">{{ message }}</p>
  </section>
</template>

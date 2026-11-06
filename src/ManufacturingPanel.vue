<script setup>
import {computed} from 'vue';
import {manufacturingBatches,manufacturingCsv} from '../shared/manufacturing.mjs';
import {handoffValidation} from '../shared/job-manifest.mjs';
import CabinetLayout from './CabinetLayout.vue';
const props=defineProps({furniture:{type:Array,required:true},manifestResult:{type:String,default:''}});
const emit=defineEmits(['export','handoff','job','verify']);
const batches=computed(()=>manufacturingBatches(props.furniture));
const validation=computed(()=>handoffValidation(batches.value));
function verifyFile(event){emit('verify',event.target.files?.[0]);event.target.value='';}
const summary=computed(()=>({sheets:batches.value.reduce((n,b)=>n+b.layout.sheets.length,0),unplaced:batches.value.reduce((n,b)=>n+b.layout.unplaced.length,0)}));
</script>
<template>
  <section class="project-manufacturing" aria-label="Project manufacturing">
    <h2>Project manufacturing</h2>
    <p data-testid="batch-summary">{{ batches.length }} batches · {{ summary.sheets }} sheets · {{ summary.unplaced }} unplaced</p>
    <p class="hint">Cabinets share sheets only when material, thickness, stock size, trim, rotation permission and kerf match. Sheet numbers restart in each batch. Layouts are planning estimates.</p>
    <button :disabled="!batches.length" @click="emit('export',manufacturingCsv(furniture))">Export project manufacturing CSV</button>
    <p data-testid="job-validation">Handoff: {{ validation.status }}</p>
    <ul><li v-for="issue in validation.issues" :key="issue.code+':'+issue.batch">{{ issue.severity }}: {{ issue.message }}{{ issue.count ? ' ('+issue.count+')' : '' }}</li></ul>
    <button :disabled="!batches.length" @click="emit('job')">Export workshop job manifest</button>
    <label>Verify job manifest<input type="file" accept=".json,application/json" aria-label="Verify job manifest file" @change="verifyFile"></label>
    <p v-if="manifestResult" role="status" data-testid="manifest-result">{{ manifestResult }}</p>
    <button :disabled="!batches.length" @click="emit('handoff')">Export printable workshop handoff</button><article v-for="batch in batches" :key="batch.number" :aria-label="`Manufacturing batch ${batch.number}`">
      <h3>Batch {{ batch.number }} · {{ batch.materialLabel }} · {{ (batch.thickness*1000).toFixed(1) }} mm</h3>
      <p>{{ batch.panelCount }} panels · {{ batch.cabinets.length }} cabinets</p>
      <ul><li v-for="cabinet in batch.cabinets" :key="cabinet.id">{{ cabinet.code }} · {{ cabinet.name }}</li></ul>
      <CabinetLayout :layout="batch.layout" scope="Batch"/>
    </article>
    <p v-if="!batches.length" class="hint">Add a cabinet to create manufacturing batches.</p>
  </section>
</template>

<script setup>
import {computed,ref,watch} from 'vue';
import {constraintRows,removeConstraint} from '../shared/constraint-display.mjs';
import {wallIds,wallCorners,wallSegment,cornerLabel,wallLabel} from '../shared/room-topology.mjs';
import {togglePointConstraint,setLengthConstraint,setAngleConstraint} from '../shared/room-constraints.mjs';
const props=defineProps({room:{type:Object,required:true},wall:String,disabled:Boolean,failure:Object});
const emit=defineEmits(['change','select','diagnostic']);
const rows=computed(()=>constraintRows(props.room)),error=ref('');
const diagnosticRows=computed(()=>{if(!props.failure)return [];const labels=constraintRows({...props.room,constraints:props.failure.rows.map(row=>row.constraint)});return props.failure.rows.map((row,i)=>({...row,label:labels[i].label}));});
watch(()=>props.room,()=>{error.value='';},{deep:true});
const length=ref(1),reference=ref('');
const corners=computed(()=>props.wall?Object.values(wallCorners(props.room,props.wall)):[]);
const references=computed(()=>wallIds(props.room).filter(id=>id!==props.wall));
watch(()=>[props.room,props.wall],()=>{
  if(props.wall) length.value=(props.room.constraints??[]).find(c=>c.type==='length'&&c.wall===props.wall)?.length??wallSegment(props.room,props.wall).length;
  if(!references.value.includes(reference.value)) reference.value=references.value[0]??'';
},{deep:true,immediate:true});
const relationship=computed(()=>(props.room.constraints??[]).find(c=>c.other&&[c.wall,c.other].includes(props.wall)&&[c.wall,c.other].includes(reference.value))?.type??'none');
const fixed=corner=>(props.room.constraints??[]).some(c=>c.type==='point'&&c.corner===corner);
function edit(change) {
  if(props.disabled||props.room.locked) return;
  try {emit('change',change());error.value='';}
  catch(e) {error.value=e.message;emit('diagnostic',e.constraintDiagnostic??null);}
}
function remove(key) {edit(()=>removeConstraint(props.room,key));}
</script>
<template>
  <section class="constraint-list" aria-label="Saved room constraints">
    <h3>Saved constraints · {{ rows.length }}</h3>
    <p class="hint">Plan markers use these C numbers. Removing a rule keeps the current shape.</p>
    <p v-if="room.locked" class="hint">Unlock walls to remove rules.</p>
    <fieldset v-if="wall && !room.locked" :disabled="disabled"><legend>{{ wallLabel(wall) }} rules</legend>
      <button v-for="corner in corners" :key="corner" :aria-pressed="fixed(corner)" @click="edit(()=>togglePointConstraint(room,corner))">{{ fixed(corner)?'Unlock':'Lock' }} {{ cornerLabel(corner) }}</button>
      <label>Fixed wall length (m)<input v-model.number="length" type="number" min="0.1" step="0.01"></label>
      <div class="opening-actions"><button @click="edit(()=>setLengthConstraint(room,wall,Number(length)))">Set fixed length</button><button @click="edit(()=>setLengthConstraint(room,wall,null))">Remove fixed length</button></div>
      <label>Reference wall<select v-model="reference"><option v-for="id in references" :key="id" :value="id">{{ wallLabel(id) }}</option></select></label>
      <p role="status">Saved relationship: {{ relationship }}</p>
      <div class="opening-actions"><button @click="edit(()=>setAngleConstraint(room,wall,reference,'parallel'))">Make parallel</button><button @click="edit(()=>setAngleConstraint(room,wall,reference,'perpendicular'))">Make perpendicular</button><button @click="edit(()=>setAngleConstraint(room,wall,reference,null))">Remove relationship</button></div>
    </fieldset>
    <p v-if="!rows.length" class="hint">No saved constraints.</p>
    <ul><li v-for="row in rows" :key="row.key">
      <button :aria-label="'Select '+row.id+': '+row.label" @click="emit('select',row.wall)"><strong>{{ row.id }}</strong> · {{ row.label }}</button>
      <button :disabled="disabled || room.locked" :aria-label="'Remove '+row.id+': '+row.label" @click="remove(row.key)">Remove</button>
    </li></ul>
    <section v-if="failure" aria-label="Constraint conflict diagnostics" data-testid="constraint-diagnostics"><h4>Failed attempt · room unchanged</h4><p>Rules involved in the failed attempt and saved point locks; this is not a minimal conflict proof. Residuals describe the attempted shape, not the saved room.</p><p>Solver iterations: {{ failure.iterations }} · tolerance {{ failure.tolerance }} (metres for lengths/points; normalized for angles)</p><p v-if="failure.pinnedCorners.length">Edited points: {{ failure.pinnedCorners.map(cornerLabel).join(', ') }}</p><ul><li v-for="row in diagnosticRows" :key="row.key"><button @click="emit('select',row.walls[0])">{{ row.label }} · {{ Number.isFinite(row.residual)?row.residual.toExponential(3):'unbounded' }} {{ row.unit }} · {{ row.satisfied?'satisfied / locked':'unsatisfied' }}</button></li></ul><div class="opening-actions"><button v-for="wallId in failure.affectedWalls" :key="wallId" @click="emit('select',wallId)">Inspect {{ wallLabel(wallId) }}</button><button @click="emit('diagnostic',null);error=''">Dismiss constraint diagnostics</button></div></section><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style>
.constraint-list{border-top:1px solid #45665d;padding-top:10px}.constraint-list h3{font-size:13px}.constraint-list ul{list-style:none;padding:0}.constraint-list li{display:flex;gap:6px;align-items:start;margin:8px 0}.constraint-list li button:first-child{flex:1;text-align:left;white-space:normal}.constraint-list strong{color:#f0cd7b}
</style>

<script setup>
import {computed,ref,watch} from 'vue';
import {connectRoomOpening,unlinkRoomOpening} from '../shared/opening-links.mjs';
const props=defineProps({project:{type:Object,required:true},adjacencies:{type:Array,required:true},disabled:Boolean});
const emit=defineEmits(['change']);
const candidateId=ref(''),sourceSide=ref('a'),openingId=ref(''),error=ref('');
const candidate=computed(()=>props.adjacencies.find(c=>c.id===candidateId.value));
const source=computed(()=>candidate.value?.[sourceSide.value]);
const destination=computed(()=>candidate.value?.[sourceSide.value==='a'?'b':'a']);
const entry=id=>props.project.rooms?.find(r=>r.id===id);
const used=computed(()=>new Set((props.project.openingLinks??[]).flatMap(c=>[c.a,c.b].map(s=>s.roomId+':'+s.openingId))));
const openings=computed(()=>entry(source.value?.roomId)?.room.openings.filter(o=>o.wall===source.value?.wallId&&!used.value.has(source.value.roomId+':'+o.id))??[]);
const locked=computed(()=>entry(source.value?.roomId)?.room.locked||entry(destination.value?.roomId)?.room.locked);
watch(()=>props.adjacencies,items=>{if(!items.some(c=>c.id===candidateId.value))candidateId.value=items[0]?.id??'';},{immediate:true});
watch(openings,items=>{if(!items.some(o=>o.id===openingId.value))openingId.value=items[0]?.id??'';},{immediate:true});
function edit(change,label) {
  if(props.disabled)return;
  try {emit('change',{project:change(),label});error.value='';}
  catch(e) {error.value=e.message;}
}
function description(link) {const o=entry(link.a.roomId)?.room.openings.find(o=>o.id===link.a.openingId);return o?o.type+' · '+o.width+' × '+o.height+' m':'';}
function connect() {
  edit(()=>connectRoomOpening(props.project,{candidateId:candidateId.value,sourceRoomId:source.value?.roomId,openingId:openingId.value,id:'connection-'+crypto.randomUUID(),pairedOpeningId:'opening-'+crypto.randomUUID()}),'Openings connected');
}
</script>
<template>
  <section class="opening-connections" aria-label="Connected openings"><h3>Connected openings · {{ project.openingLinks?.length??0 }}</h3>
    <fieldset v-if="adjacencies.length" :disabled="disabled"><legend>Connect an opening</legend>
      <label>Shared wall<select v-model="candidateId"><option v-for="c in adjacencies" :key="c.id" :value="c.id">{{ c.a.roomName }} · {{ c.a.wallName }} / {{ c.b.roomName }} · {{ c.b.wallName }}</option></select></label>
      <label>Source room<select v-model="sourceSide"><option value="a">{{ candidate?.a.roomName }}</option><option value="b">{{ candidate?.b.roomName }}</option></select></label>
      <label>Source opening<select v-model="openingId"><option v-for="o in openings" :key="o.id" :value="o.id">{{ o.type }} · {{ o.width }} × {{ o.height }} m · offset {{ o.offset }} m</option></select></label>
      <p v-if="!openings.length">Add an opening to this source wall using its inspector first.</p><p v-if="locked">Unlock both rooms to connect openings.</p>
      <button :disabled="!openingId||locked" @click="connect">Connect opening</button>
      <p>Creates a mirrored opening in the other room, or reuses an aligned one. Both openings must fit. Doors use mirrored hinge and swing.</p>
    </fieldset>
    <ul><li v-for="link in project.openingLinks??[]" :key="link.id"><strong>{{ entry(link.a.roomId)?.name }} ↔ {{ entry(link.b.roomId)?.name }}</strong><span>{{ description(link) }}</span><button :disabled="disabled" @click="edit(()=>unlinkRoomOpening(project,link.id),'Openings unlinked')">Unlink</button></li></ul>
    <p>Links preserve alignment: edits that break a connection are rejected. Unlinking keeps both openings. Meshes remain independent; no door physics or wall-thickness check is implied.</p><p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style>.opening-connections{font-size:12px}.opening-connections h3{font-size:13px}.opening-connections fieldset{border:1px solid #bbc7bd}.opening-connections label{margin:8px 0}.opening-connections ul{list-style:none;padding:0;max-height:120px;overflow:auto}.opening-connections li{padding:6px;border-bottom:1px solid #bbc7bd}.opening-connections span{display:block;overflow-wrap:anywhere}.opening-connections button{font-size:11px;padding:5px 8px}</style>

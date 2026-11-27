<script setup>
import {computed,ref} from 'vue';
import {buildingQuantities,buildingQuantitiesJson,buildingQuantitiesCsv} from '../shared/building-quantities.mjs';
const props=defineProps({project:{type:Object,required:true}});
const q=computed(()=>buildingQuantities(props.project)),error=ref('');
const number=value=>value===null?'Withheld: overlapping rooms':Number(value.toFixed(3)).toLocaleString();
function download(csv) {
  try {
    const text=csv?buildingQuantitiesCsv(props.project):buildingQuantitiesJson(props.project),url=URL.createObjectURL(new Blob([text],{type:csv?'text/csv;charset=utf-8':'application/json'})),link=document.createElement('a');
    link.href=url;link.download=(props.project.name.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)||'terratec')+'_building-quantities.'+(csv?'csv':'json');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);error.value='';
  }catch(e){error.value=e.message;}
}
</script>
<template>
 <section class="building-quantities" aria-label="Whole-building quantities"><h3>Whole-building quantities · {{ q.totals.roomCount }} rooms</h3>
  <p v-if="q.overlaps.length" role="status">{{ q.overlaps.length }} overlapping room pairs: combined areas, volumes and boundary lengths are withheld. Room sums below may count overlapping space more than once.</p>
  <dl><div><dt>Combined floor area</dt><dd>{{ number(q.totals.combinedFloorArea) }}{{ q.totals.combinedFloorArea===null?'':' m²' }}</dd></div><div><dt>Combined interior volume</dt><dd>{{ number(q.totals.combinedInteriorVolume) }}{{ q.totals.combinedInteriorVolume===null?'':' m³' }}</dd></div><div><dt>Room area sum</dt><dd>{{ number(q.totals.roomAreaSum) }} m²</dd></div><div><dt>Boundary lines, shared spans once</dt><dd>{{ number(q.totals.uniqueBoundaryLength) }}{{ q.totals.uniqueBoundaryLength===null?'':' m' }}</dd></div><div><dt>Exposed boundary estimate</dt><dd>{{ number(q.totals.exposedBoundaryLength) }}{{ q.totals.exposedBoundaryLength===null?'':' m' }}</dd></div><div><dt>Net room-facing wall area</dt><dd>{{ number(q.totals.netWallFaceArea) }} m²</dd></div><div><dt>Logical doors / windows</dt><dd>{{ q.totals.logicalDoors }} / {{ q.totals.logicalWindows }}</dd></div><div><dt>Linked door / window pairs</dt><dd>{{ q.totals.linkedDoorPairs }} / {{ q.totals.linkedWindowPairs }}</dd></div><div><dt>Cabinet / design instances</dt><dd>{{ q.totals.cabinetInstances }} / {{ q.totals.designInstances }}</dd></div></dl>
  <div class="building-quantity-table"><table><thead><tr><th>Room</th><th>Floor m²</th><th>Volume m³</th><th>Perimeter m</th><th>Net wall faces m²</th></tr></thead><tbody><tr v-for="room in q.rooms" :key="room.id"><th>{{ room.name }}</th><td>{{ number(room.floorArea) }}</td><td>{{ number(room.interiorVolume) }}</td><td>{{ number(room.perimeter) }}</td><td>{{ number(room.netWallFaceArea) }}</td></tr></tbody></table></div>
  <details><summary>How these quantities are counted</summary><ul><li v-for="note in q.scope" :key="note">{{ note }}</li></ul></details>
  <button @click="download(false)">Export building quantities JSON</button><button @click="download(true)">Export building quantities CSV</button><p v-if="error" role="alert">{{ error }}</p>
 </section>
</template>
<style>.building-quantities{font-size:12px;border-top:1px solid #bbc7bd;margin-top:10px}.building-quantities h3{font-size:13px}.building-quantities dl{margin:8px 0}.building-quantities dl div{gap:12px}.building-quantities dd{text-align:right}.building-quantity-table{max-height:180px;overflow:auto}.building-quantities table{width:100%;border-collapse:collapse;white-space:nowrap}.building-quantities td,.building-quantities th{text-align:left;padding:5px;border-bottom:1px solid #bbc7bd}.building-quantities details{margin:8px 0}.building-quantities button{font-size:11px;padding:6px;margin:4px 6px 4px 0}</style>

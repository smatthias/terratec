<script setup>
import {computed} from 'vue';
import {roomEntries,activeRoomId,switchProjectRoom} from '../shared/project-rooms.mjs';
import {floorPlanLayout} from '../shared/room-placement.mjs';
const props=defineProps({project:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['change','close']);
const layout=computed(()=>floorPlanLayout(roomEntries(props.project))),active=computed(()=>activeRoomId(props.project));
const conflicts=computed(()=>new Set(layout.value.overlaps.flatMap(pair=>[pair.a,pair.b])));
function select(id) {if(!props.disabled) emit('change',{project:switchProjectRoom(props.project,id),label:'Room selected in floor plan'});}
</script>
<template>
  <section class="floor-plan-overview" aria-label="Building floor plan">
    <div class="floor-plan-toolbar"><strong>Floor plan · {{ layout.rooms.length }} rooms</strong><button @click="emit('close')">Back to room</button></div>
    <p class="floor-plan-note">Room footprints · metres · select a room, then edit its placement in Room &amp; walls. Overlaps are advisory; shared walls are not connected.</p>
    <svg :viewBox="layout.viewBox" class="floor-plan-map" role="group" aria-label="Room footprints">
      <g v-for="room in layout.rooms" :key="room.id" role="button" :tabindex="disabled?-1:0" :aria-disabled="disabled" :aria-pressed="active===room.id" :aria-label="'Select room '+room.name" :class="{active:active===room.id,overlap:conflicts.has(room.id)}" @click="select(room.id)" @keydown.enter="select(room.id)" @keydown.space.prevent="select(room.id)">
        <title>{{ room.name }}{{ conflicts.has(room.id)?' · overlapping room footprint':'' }}</title>
        <polygon :points="room.points" :stroke-width="layout.strokeWidth"/>
        <text :x="room.centre.x" :y="room.centre.z" :font-size="layout.fontSize">{{ room.name }}</text>
      </g>
    </svg>
    <div class="floor-plan-feedback" role="status"><template v-if="layout.overlaps.length"><strong>{{ layout.overlaps.length }} overlapping pairs</strong><ul><li v-for="pair in layout.overlaps" :key="pair.a+':'+pair.b">{{ pair.names.join(' / ') }}</li></ul></template><span v-else>No overlapping room interiors. Wall thickness and shared openings are not checked.</span></div>
  </section>
</template>
<style>
.floor-plan-overview{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:#edf1e8;color:#263e3c;padding:12px;overflow:auto}.floor-plan-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}.floor-plan-note,.floor-plan-feedback{font-size:12px;line-height:1.5}.floor-plan-map{flex:1;min-height:240px;width:100%;background:#f9faf5}.floor-plan-map polygon{fill:#dbe5d4;stroke:#607d70}.floor-plan-map g{cursor:pointer}.floor-plan-map g.overlap polygon{fill:#edcfc3;stroke:#a04430}.floor-plan-map g.active polygon,.floor-plan-map g:focus polygon{stroke:#126e83;stroke-width:3px;vector-effect:non-scaling-stroke}.floor-plan-map text{text-anchor:middle;dominant-baseline:middle;fill:#263e3c;pointer-events:none}.floor-plan-feedback ul{margin:4px 0;padding-left:20px;max-height:80px;overflow:auto}
</style>

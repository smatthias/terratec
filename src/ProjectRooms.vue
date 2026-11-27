<script setup>
import {computed,ref,watch} from 'vue';
import {roomEntries,activeRoomId,activeRoomName,switchProjectRoom,addProjectRoom,renameProjectRoom,MAX_ROOMS} from '../shared/project-rooms.mjs';
const props=defineProps({project:{type:Object,required:true},disabled:Boolean});
const emit=defineEmits(['change']);
const rooms=computed(()=>roomEntries(props.project)),active=computed(()=>activeRoomId(props.project));
const rename=ref(''),name=ref(''),error=ref('');
watch(()=>[active.value,activeRoomName(props.project)],()=>{rename.value=activeRoomName(props.project);},{immediate:true});
function edit(change,label) {
  if(props.disabled) return;
  try {emit('change',{project:change(),label});error.value='';}
  catch(e) {error.value=e.message;}
}
function add() {
  edit(()=>addProjectRoom(props.project,{id:'room-'+crypto.randomUUID(),name:name.value||'Room '+(rooms.value.length+1)}),'Room added');
}
</script>
<template>
  <fieldset class="project-rooms" :disabled="disabled" aria-label="Project rooms"><legend>Rooms · {{ rooms.length }}/{{ MAX_ROOMS }}</legend>
    <label>Active room<select :value="active" @change="edit(()=>switchProjectRoom(project,$event.target.value),'Room switched')"><option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.name }}</option></select></label>
    <label>Room name<input v-model="rename" maxlength="60"></label><button @click="edit(()=>renameProjectRoom(project,active,rename),'Room renamed')">Rename room</button>
    <label>New room name<input v-model="name" maxlength="60" placeholder="Next room"></label><button :disabled="rooms.length>=MAX_ROOMS" @click="add">Add room</button>
    <p class="hint">The canvas, quantities and manufacturing use the active room. Save and JSON export include every room. Rooms are independent; shared walls are not connected yet.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>
<style>.project-rooms{margin-bottom:16px;border:1px solid #bbc7bd;border-radius:6px}.project-rooms legend{font-size:12px;font-weight:600}</style>

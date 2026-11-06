<script setup>
import {ref,computed,watch} from 'vue';
const props=defineProps({profiles:{type:Array,required:true}});
const emit=defineEmits(['save','apply','remove']);
const name=ref(''),choice=ref('');
const current=computed(()=>props.profiles.find(p=>p.id===choice.value));
watch(()=>props.profiles,()=>{if(!current.value)choice.value='';},{deep:true});
</script>
<template>
  <section class="workshop-profiles" aria-label="Workshop profiles">
    <h3>Workshop profiles</h3>
    <p class="hint">Save the applied cabinet’s stock, trim, kerf and rotation settings. Profiles stay with this project. Saving an existing name updates that profile; cabinet settings remain independent.</p>
    <label>Workshop profile name<input v-model="name" maxlength="60"></label>
    <button :disabled="!name.trim()" @click="emit('save',name)">Save workshop profile</button>
    <label v-if="profiles.length">Workshop profile<select v-model="choice" aria-label="Workshop profile"><option value="">Choose workshop profile</option><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
    <p v-if="current" class="hint">{{ current.stockLengthMm }} × {{ current.stockWidthMm }} mm · trim {{ current.stockTrimMm }} mm · kerf {{ current.stockKerfMm }} mm · rotation {{ current.stockAllowRotation ? 'allowed' : 'disabled' }}</p>
    <button :disabled="!current" @click="emit('apply',choice)">Apply workshop profile</button>
    <button :disabled="!current" @click="emit('remove',choice)">Delete workshop profile</button>
  </section>
</template>

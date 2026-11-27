const key=name=>name.trim().toLowerCase();
export function validateWorkshopCapacity(value) {
  if(!Array.isArray(value)||value.length>32)throw Error('Choose at most 32 workshop capacities');
  const names=new Set();
  return value.map(entry=>{
    if(typeof entry?.name!=='string'||!entry.name.trim()||entry.name.trim().length>80)throw Error('Capacity workshop name must contain 1–80 characters');
    const name=entry.name.trim(),id=key(name);
    if(names.has(id))throw Error('Capacity workshop names must be unique');names.add(id);
    if(!Number.isInteger(entry.sheetsPerDay)||entry.sheetsPerDay<1||entry.sheetsPerDay>10000)throw Error('Workshop daily capacity must be 1–10000 whole sheets');
    return {name,sheetsPerDay:entry.sheetsPerDay};
  });
}
// Advisory due-date buckets. Each active job reserves its full sheet count on
// its due date; no duration, work-calendar, machine or labour estimate is implied.
export function workshopCapacityPlan(jobs,settings,candidate=null) {
  const limits=validateWorkshopCapacity(settings),groups=new Map(limits.map(p=>[key(p.name),{...p,days:new Map()}]));
  const add=(job,proposed=false)=>{
    if(!job.workshop?.trim())return;
    const id=key(job.workshop);if(!groups.has(id))groups.set(id,{name:job.workshop.trim(),sheetsPerDay:null,days:new Map()});
    const group=groups.get(id),date=job.dueDate||'';
    if(!group.days.has(date))group.days.set(date,{date,sheets:0,jobs:0,proposedSheets:0});
    const day=group.days.get(date),sheets=job.summary.sheets;
    if(!Number.isInteger(sheets)||sheets<0)throw Error('Job sheet counts must be nonnegative integers');
    day.sheets+=sheets;day.jobs++;if(proposed)day.proposedSheets+=sheets;
  };
  for(const job of jobs)if(['assigned','in-production'].includes(job.workflowState))add(job);
  if(candidate&&!jobs.some(j=>j.id===candidate.id&&['assigned','in-production'].includes(j.workflowState)))add(candidate,true);
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(group=>({name:group.name,sheetsPerDay:group.sheetsPerDay,days:[...group.days.values()].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')).map(day=>({...day,utilization:day.date&&group.sheetsPerDay?Math.round(day.sheets/group.sheetsPerDay*100):null,overbooked:!!day.date&&group.sheetsPerDay!==null&&day.sheets>group.sheetsPerDay}))}));
}

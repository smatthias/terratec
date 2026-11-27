import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkshopCapacity,workshopCapacityPlan} from './workshop-capacity.mjs';
const job=(id,sheets,workflowState='assigned',dueDate='2026-12-01',workshop='Berlin')=>({id,summary:{sheets},workflowState,dueDate,workshop});
test('capacity settings normalize names and reject ambiguous or invalid limits',()=>{
 assert.deepEqual(validateWorkshopCapacity([{name:' Berlin ',sheetsPerDay:8}]),[{name:'Berlin',sheetsPerDay:8}]);
 for(const value of [null,[{name:'',sheetsPerDay:8}],[{name:'Berlin',sheetsPerDay:1.5}],[{name:'Berlin',sheetsPerDay:0}],[{name:'Berlin',sheetsPerDay:Infinity}],[{name:'Berlin',sheetsPerDay:'8'}],Array.from({length:33},(_,i)=>({name:String(i),sheetsPerDay:1})),[{name:'Berlin',sheetsPerDay:8},{name:' BERLIN ',sheetsPerDay:2}]])assert.throws(()=>validateWorkshopCapacity(value));
});
test('active jobs combine by workshop and due date without counting closed or unassigned jobs',()=>{
 const jobs=[job('a',3),job('b',6,'in-production',undefined,' BERLIN '),job('c',9,'completed'),job('d',10,'cancelled'),job('e',10,'reviewed'),job('f',2,'assigned','2026-12-02')],before=structuredClone(jobs);
 const [group]=workshopCapacityPlan(jobs,[{name:'Berlin',sheetsPerDay:8}]);assert.equal(group.days.length,2);assert.deepEqual(group.days[0],{date:'2026-12-01',sheets:9,jobs:2,proposedSheets:0,utilization:113,overbooked:true});assert.equal(group.days[1].overbooked,false);assert.deepEqual(jobs,before);
});
test('undated and unconfigured reservations remain visible without invented utilization',()=>{
 const [group]=workshopCapacityPlan([job('a',3,'assigned',''),job('b',2)],[]);assert.equal(group.sheetsPerDay,null);assert.ok(group.days.every(d=>d.utilization===null&&!d.overbooked));assert.equal(group.days.at(-1).date,'');
 const dated=workshopCapacityPlan([job('a',3,'assigned','')],[{name:'Berlin',sheetsPerDay:8}]);assert.equal(dated[0].days[0].utilization,null);
});
test('candidate assignments preview overload without duplicating an already active job',()=>{
 const settings=[{name:'Berlin',sheetsPerDay:8}],jobs=[job('a',6)],candidate=job('b',3,'reviewed');
 assert.equal(workshopCapacityPlan(jobs,settings,candidate)[0].days[0].proposedSheets,3);assert.equal(workshopCapacityPlan(jobs,settings,candidate)[0].days[0].overbooked,true);
 assert.equal(workshopCapacityPlan(jobs,settings,job('a',6))[0].days[0].sheets,6);assert.equal(workshopCapacityPlan([],settings)[0].days.length,0);
});

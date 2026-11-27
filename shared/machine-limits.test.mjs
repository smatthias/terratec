import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MACHINE_LIMIT_DEFAULTS as defaults,validateMachineLimits} from './machine-limits.mjs';
import {machineLimitIssues} from './machine-limit-checks.mjs';
import {createDesign,updateCam} from './furniture-design-edit.mjs';
import {validateDesign} from './furniture-design.mjs';
import {camPlan} from './design-cam.mjs';
import {designProgram,partProgram} from './cam-export.mjs';
const design=()=>{let n=0;return createDesign({id:'machine-box',name:'Machine box',template:'box',makeId:()=> 'm'+(++n)});};
test('machine limits persist through design normalization and can be disabled',()=>{
 const base=design(),enabled=updateCam(base,{machine:{...defaults}});assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(enabled))).cam.machine,defaults);assert.ok(camPlan(enabled).ready);assert.equal(updateCam(enabled,{machine:null}).cam?.machine,undefined);assert.equal(base.cam?.machine,undefined);
 for(const patch of [{maxRpm:NaN},{travelX:0},{offsetY:-1},{offsetX:2500},{maxFeed:'6000'}])assert.throws(()=>validateMachineLimits({...defaults,...patch}),/Machine/);
 assert.throws(()=>validateMachineLimits({}),/Machine/);
});
test('each machine limit blocks both aggregate and individual NC export',()=>{
 for(const [key,value,code] of [['travelX',100,'STOCK'],['maxDepth',1,'Z'],['maxSafeZ',1,'Z'],['maxFeed',100,'FEED'],['maxRpm',1000,'RPM'],['maxToolDiameter',1,'TOOL'],['offsetX',0,'XY']]) {
  const d=updateCam(design(),{machine:{...defaults,[key]:value}}),plan=camPlan(d);assert.equal(plan.ready,false,key);const issue=plan.issues.find(i=>i.code==='MACHINE_'+code);assert.ok(issue,key);assert.throws(()=>designProgram(d),/Resolve CAM errors/);const p=plan.programs.find(p=>p.partId===issue.partId);assert.throws(()=>partProgram(d,p.partId,p.face),/Resolve CAM errors/);
 }
});
test('arc bounds include interior extrema missed by endpoint checks and respect cutter radius',()=>{
 const p={partId:'arc',name:'Arc panel',face:'B',sheet:{lengthMm:10,widthMm:10},blocks:[{tool:{diameter:2,feed:100,plunge:100,rpm:1000},moves:[{g:0,x:5,y:5,z:2},{g:3,x:5,y:5,z:-1,i:0,j:10,f:100}]}]};
 const m={...defaults,offsetX:2,offsetY:2,travelX:30,travelY:20};assert.ok(machineLimitIssues([p],m).some(i=>i.code==='MACHINE_XY'));assert.equal(machineLimitIssues([p],undefined).length,0);
});
test('enabling permissive limits preserves existing generated NC content',()=>{
 const base=design();assert.equal(designProgram(updateCam(base,{machine:{...defaults}})),designProgram(base));
});

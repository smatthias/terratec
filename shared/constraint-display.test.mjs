import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject} from './project.mjs';
import {setAngleConstraint,setLengthConstraint,togglePointConstraint} from './room-constraints.mjs';
import {constraintRows,constraintKey,removeConstraint} from './constraint-display.mjs';
import {createHistory,commitHistory,undoHistory,redoHistory} from './history.mjs';
const base=()=>validateProject({schemaVersion:1,units:'m',name:'Rules',room:{width:6,depth:4,height:3}});
function room() {return setAngleConstraint(setLengthConstraint(togglePointConstraint(base().room,'north-west'),'north',6),'north','south','parallel');}
test('constraint rows identify points, lengths and both walls of a relationship',()=>{
  const r=room(),before=structuredClone(r),rows=constraintRows(r);
  assert.deepEqual(rows.map(r=>r.id),['C1','C2','C3']);
  assert.match(rows[0].label,/North-west corner locked at -3.000, -2.000 m/);
  assert.deepEqual(rows[0].anchors,[{key:'north-west',x:-3,z:-2,point:true}]);
  assert.equal(rows[0].wall,'north');
  assert.equal(rows[1].symbol,'=6.00 m');assert.equal(rows[1].anchors.length,1);
  assert.equal(rows[2].symbol,'∥');assert.deepEqual(rows[2].anchors.map(a=>a.key),['north','south']);
  assert.deepEqual(r,before);
});
test('relationship keys are order-independent and display perpendicular relationships',()=>{
  assert.equal(constraintKey({type:'parallel',wall:'north',other:'south'}),constraintKey({type:'parallel',wall:'south',other:'north'}));
  const r=setAngleConstraint(base().room,'north','east','perpendicular'),row=constraintRows(r)[0];
  assert.equal(row.symbol,'⊥');assert.match(row.label,/perpendicular to/);
});
test('removal preserves geometry and other rules, is undoable and survives normalization',()=>{
  const r=room(),before=structuredClone(r),key=constraintRows(r)[1].key,next=removeConstraint(r,key);
  assert.deepEqual(next.outline,r.outline);assert.equal(next.constraints.length,2);assert.deepEqual(r,before);
  const h=commitHistory(createHistory(r),next);assert.deepEqual(undoHistory(h).present,r);assert.deepEqual(redoHistory(undoHistory(h)).present,next);
  assert.deepEqual(validateProject({...base(),schemaVersion:9,room:next}).room.constraints,next.constraints);
});
test('removing the final rule drops constraint metadata and rejects stale/locked removal',()=>{
  const r=togglePointConstraint(base().room,'north-west'),key=constraintRows(r)[0].key,next=removeConstraint(r,key);
  assert.equal(next.constraints,undefined);assert.deepEqual(next.outline,r.outline);
  assert.equal(validateProject({...base(),schemaVersion:9,room:next}).schemaVersion,6);
  assert.throws(()=>removeConstraint(next,key),/no longer exists/);
  assert.throws(()=>removeConstraint({...r,locked:true},key),/locked/);
  assert.deepEqual(constraintRows(next),[]);
});

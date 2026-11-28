import {nativeMeasurementReport,nativeMeasurementsCsv} from './native-measurement-export.mjs';
export const MAX_NATIVE_MEASUREMENT_REPORT_BYTES=16777216;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
function csvRows(text){
 const rows=[];let row=[],i=0;
 while(i<text.length){if(text[i++]!=='"')throw Error('Expected the quoted TerraTec CSV format');let value='',closed=false;
  while(i<text.length){const c=text[i++];if(c==='"'){if(text[i]==='"'){value+='"';i++;}else{closed=true;break;}}else value+=c;if(value.length>65536)throw Error('Measurement CSV field exceeds limit');}
  if(!closed)throw Error('Truncated measurement CSV field');row.push(value);if(row.length>64)throw Error('Too many measurement CSV columns');
  if(text[i]===','){i++;if(i===text.length)throw Error('Truncated measurement CSV row');}
  else if(text.slice(i,i+2)==='\r\n'){i+=2;rows.push(row);row=[];if(rows.length>4097)throw Error('Too many measurement CSV rows');}
  else throw Error('Expected canonical CSV comma or CRLF');
 }
 if(row.length||rows.length<2)throw Error('Incomplete measurement CSV report');return rows;
}
export function verifyNativeMeasurements(text,{scene,manifest,identity}={}){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_NATIVE_MEASUREMENT_REPORT_BYTES)throw Error('Measurement report exceeds 16 MiB');
 let format,scope,elementId,received;
 if(text.trimStart().startsWith('{')){format='json';try{received=JSON.parse(text);}catch{throw Error('Invalid measurement report JSON');}scope=received?.scope;if(!Array.isArray(received?.elements)||received.elements.length<1||received.elements.length>4096)throw Error('Invalid measurement report elements');if(scope==='selected-element'){if(received.elements.length!==1)throw Error('Selected report must contain exactly one element');elementId=received.elements[0]?.elementId;}}
 else{format='csv';const rows=csvRows(text),scopeIndex=rows[0].indexOf('scope'),idIndex=rows[0].indexOf('element_id');if(scopeIndex<0||idIndex<0)throw Error('Missing measurement CSV scope or element ID');scope=rows[1][scopeIndex];if(scope==='selected-element'){if(rows.length!==2)throw Error('Selected report must contain exactly one element');elementId=rows[1][idIndex];}}
 if(!['selected-element','all-bundle-elements'].includes(scope)||scope==='selected-element'&&typeof elementId!=='string')throw Error('Invalid measurement report scope');
 const expected=nativeMeasurementReport(scene,manifest,identity,scope==='selected-element'?elementId:null),matches=format==='json'?JSON.stringify(canonical(received))===JSON.stringify(canonical(expected)):text===nativeMeasurementsCsv(expected);
 if(!matches)throw Error('Measurement report disagrees with the verified source ZIP');
 return {status:'verified-source-consistency',format,scope,elements:expected.elements.length,archiveSha256:expected.archive.archiveSha256};
}

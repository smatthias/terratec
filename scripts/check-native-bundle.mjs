import {open} from 'node:fs/promises';
import {MAX_ADAPTER_ZIP_BYTES} from '../shared/stored-zip.mjs';
import {verifyNativeBundle} from '../shared/native-bundle-verifier.mjs';
let file;
try{if(process.argv.length!==3)throw Error('Usage: npm run check:native-bundle -- /path/to/terratec-native-viewer.zip');file=await open(process.argv[2],'r');const info=await file.stat();if(!info.isFile()||info.size>MAX_ADAPTER_ZIP_BYTES)throw Error('Native bundle exceeds archive size limit or is not a regular file');const bytes=new Uint8Array(info.size+1);let offset=0;while(offset<bytes.length){const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,null);if(!bytesRead)break;offset+=bytesRead;}if(offset!==info.size)throw Error('Native bundle changed size while reading');const result=await verifyNativeBundle(bytes.subarray(0,offset));console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}finally{await file?.close();}

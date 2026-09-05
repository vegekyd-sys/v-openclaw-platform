import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL}from'node:url';
export const marker='// vbrowser-target-identity-diagnostic-v1';
export function patchBrowserTargetDiagnostics(source){
 if(source.includes(marker))return source;
 const begin=source.indexOf('async function readPageTargetInfo(page) {'),end=source.indexOf('\nfunction pageTargetInfo(page)',begin);assert(begin>=0&&end>begin);
 let f=source.slice(begin,end);
 f=f.replace('let session;',`let session;\n\t${marker}\n\tconst diagnosticAt = Date.now();\n\tlet diagnosticStage = "attach";`);
 f=f.replace('timedOut = true;',`timedOut = true;\n\t\t\tconsole.warn("[vbrowser-target-identity] " + JSON.stringify({kind:"timeout",stage:diagnosticStage,elapsedMs:Date.now()-diagnosticAt}));`);
 f=f.replace('const { targetInfo } = await session.send("Target.getTargetInfo");',`diagnosticStage = "getTargetInfo";\n\t\t\tconst { targetInfo } = await session.send("Target.getTargetInfo");`);
 const needle='return await Promise.race([read, timeout]);\n\t} finally {';assert(f.includes(needle));
 f=f.replace(needle,`return await Promise.race([read, timeout]);\n\t} catch (error) {\n\t\tconsole.warn("[vbrowser-target-identity] " + JSON.stringify({kind:"error",stage:diagnosticStage,elapsedMs:Date.now()-diagnosticAt,error:redactCdpErrorText(String(error)).slice(0,400)}));\n\t\tthrow error;\n\t} finally {`);
 return source.slice(0,begin)+f+source.slice(end);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const file=process.argv[2],before=fs.readFileSync(file,'utf8'),after=patchBrowserTargetDiagnostics(before);if(before!==after){fs.copyFileSync(file,file+'.before-target-diagnostics');fs.writeFileSync(file,after);}console.log(JSON.stringify({changed:before!==after}));}

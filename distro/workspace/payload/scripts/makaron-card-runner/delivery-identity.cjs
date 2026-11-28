'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const urlOf=a=>a?.url||a?.videoUrl||a?.imageUrl||a?.audioUrl||a?.fileUrl||'';
const idOf=a=>String(a?.id||a?.media_id||a?.mediaId||'');
const snapshotOf=a=>String(a?.snapshot_id||a?.snapshotId||'');
const good=s=>['completed','succeeded','ready','success'].includes(String(s||'').toLowerCase());
function fail(code,detail){const e=new Error(`发送前版本核对未通过：${detail}`);e.code=code;throw e;}
function finalAssets(output){
 if(!output)return [];
 const raw=output.raw||{};
 const assets=[...(raw.result?.videos||[]).map(a=>({...a,type:'video'})),...(raw.result?.images||[]).map(a=>({...a,type:'image'})),...(raw.output||[]).filter(a=>['video','image','audio','music','file'].includes(a.type))];
 if(!assets.some(a=>a.type==='video'&&urlOf(a))&&output.videoUrl)assets.push({type:'video',url:output.videoUrl});
 for(const url of output.imageUrls||[])if(!assets.some(a=>urlOf(a)===url))assets.push({type:'image',url});
 return [...new Map(assets.filter(a=>urlOf(a)).map(a=>[`${a.type}:${urlOf(a)}`,{...a,url:urlOf(a)}])).values()];
}
// Do not choose the globally newest project file: independent outputs in a batch
// are not revisions of one another. Current-run final URLs are the selection.
function verifyCandidate(candidate,{output,media,baselineUrls=new Set(),baselineIds=new Set()}){
 const url=urlOf(candidate);
 const selected=finalAssets(output).find(a=>a.type===candidate.type&&urlOf(a)===url);
 if(!selected)fail('DELIVERY_NOT_CURRENT_FINAL','该文件不在本轮最终结果中，未发送旧版或中间版。');
 const rows=media.filter(m=>urlOf(m)===url);
 if(!rows.length)fail('DELIVERY_MEDIA_UNVERIFIED','项目中未找到该结果，无法确认文件身份。');
 if(rows.some(m=>m.status&&!good(m.status)))fail('DELIVERY_MEDIA_NOT_READY',`该结果尚未成功导出（${rows.map(m=>m.status||'unknown').join('/')}）；task=${rows.map(m=>m.task_id||m.taskId||idOf(m)).join(',')}`);
 const row=rows.find(m=>good(m.status))||rows[0];
 if(!row.status&&!good(output.raw?.status))fail('DELIVERY_STATUS_UNVERIFIED','项目和本轮任务均缺少成功状态。');
 const selectedId=idOf(selected), rowId=idOf(row);
 if(selectedId&&rowId&&selectedId!==rowId)fail('DELIVERY_ID_MISMATCH','本轮结果ID与项目记录不一致。');
 if(baselineUrls.has(url)||baselineIds.has(rowId))fail('DELIVERY_PREVIOUS_RUN_ASSET','该文件在本轮开始前已存在，不能冒充本轮修正版。');
 const snapshot=snapshotOf(row)||snapshotOf(selected);
 const designs=output.designs||[];
 if(snapshot&&designs.length&&designs.some(d=>snapshotOf(d))&&!designs.some(d=>snapshotOf(d)===snapshot))fail('DELIVERY_SNAPSHOT_MISMATCH','导出文件与本轮设计版本不一致。');
 const created=Date.parse(row.created_at||row.createdAt||'');
 if(snapshot&&Number.isFinite(created)&&media.some(m=>snapshotOf(m)===snapshot&&String(m.type||'')===String(row.type||'')&&Date.parse(m.created_at||m.createdAt||'')>created))fail('DELIVERY_SUPERSEDED_EXPORT','同一设计已有更晚的导出，请确认最终版本。');
 return {...candidate,id:rowId||candidate.id,snapshotId:snapshot,status:row.status||'completed',identity:{mediaId:rowId,taskId:row.task_id||row.taskId||'',snapshotId:snapshot,createdAt:row.created_at||row.createdAt||'',sha256:row.sha256||row.content_sha256||'',sizeBytes:Number(row.size_bytes||row.sizeBytes||0),verifiedAt:new Date().toISOString()}};
}
function verifyLocalFile(file,asset){
 const sizeBytes=fs.statSync(file).size;
 if(!sizeBytes)fail('DELIVERY_EMPTY_FILE','下载得到空文件。');
 const sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const expected=asset.identity||{};
 if(expected.sha256&&expected.sha256.toLowerCase()!==sha256)fail('DELIVERY_HASH_MISMATCH','下载文件与项目记录的内容哈希不一致。');
 if(expected.sizeBytes&&expected.sizeBytes!==sizeBytes)fail('DELIVERY_SIZE_MISMATCH','下载文件大小与项目记录不一致。');
 return {...expected,sha256,sizeBytes,localMtime:fs.statSync(file).mtime.toISOString()};
}
module.exports={finalAssets,verifyCandidate,verifyLocalFile};

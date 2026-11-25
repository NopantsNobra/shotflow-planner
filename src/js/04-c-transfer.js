/* UI adapter for the binary archive. Existing JSON backup/restore remains readable. */
let archiveOperation=null;
function archiveCodec(){
  const codec=globalThis.zip;
  if(!codec||!globalThis.crypto?.subtle)throw Error('当前浏览器无法使用 ZIP 资产包，请使用安全上下文或本地文件');
  return codec;
}
function startArchiveOperation(title,controller=new AbortController()){
  if(archiveOperation)throw Error('已有资产操作正在进行');
  const modal=document.getElementById('archiveProgressModal'),bar=document.getElementById('archiveProgressBar'),button=document.getElementById('archiveCancel');
  const op={controller,modal,bar,button};
  archiveOperation=op;
  document.getElementById('archiveProgressTitle').textContent=title;
  document.getElementById('archiveProgressText').textContent='正在准备…';
  bar.removeAttribute('value');button.disabled=false;button.onclick=()=>{controller.abort();button.disabled=true;document.getElementById('archiveProgressText').textContent='正在取消…';};
  modal.classList.add('show');return op;
}
function archiveProgress(op,label,done,total){
  if(archiveOperation!==op||op.controller.signal.aborted)return;
  document.getElementById('archiveProgressText').textContent=label;
  if(total>0){op.bar.max=total;op.bar.value=done;}else op.bar.removeAttribute('value');
}
function finishArchiveOperation(op){
  if(archiveOperation!==op)return;
  op.modal.classList.remove('show');op.button.onclick=null;archiveOperation=null;
}
function archiveDataURL(blob){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error||Error('图片转换失败'));r.readAsDataURL(blob);});
}
async function archiveImageBlob(value){
  if(!validBackupImage(value))throw Error('引用图片缺失或格式不合法');
  if(value.startsWith('data:image/svg+xml')){
    // Only the exact built-in legacy template passes validBackupImage. Rasterize
    // cloned demo illustrations, never import arbitrary SVG into the ZIP format.
    const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error('内置示例图片转换失败'));img.src=value;});
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;canvas.getContext('2d').drawImage(img,0,0,640,420);
    return new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('内置示例图片转换失败')),'image/png'));
  }
  const split=value.indexOf(','),mime=value.slice(5,value.indexOf(';')),payload=value.slice(split+1);
  if(payload.length>Math.ceil(assetArchiveLimits().maxImageBytes/3)*4)throw Error('单张图片超过处理上限');
  const raw=atob(payload),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
async function exportArchiveProjects(entries,scope){
  let op=null;
  try{
    const codec=archiveCodec();
    op=startArchiveOperation('导出 ZIP 资产包');
    const data={dataVersion:1,kind:scope,entries:JSON.parse(JSON.stringify(entries))};
    const poseKeys=new Map();
    const remap=key=>{
      if(!String(key||'').startsWith('shisei:'))return key;
      if(!poseKeys.has(key))poseKeys.set(key,'pose-'+crypto.randomUUID());
      return poseKeys.get(key);
    };
    for(const p of data.entries){
      for(const r of p.refs||[])r.key=remap(r.key);
      for(const m of p.mood||[])if(m.type==='image')m.content=remap(m.content);
      for(const s of p.shots||[])s.refIds=(s.refIds||[]).map(remap);
    }
    const sourceKeys=new Map([...poseKeys].map(([a,b])=>[b,a]));
    const chunks=[];
    const result=await writeAssetArchive(data,async key=>{
      const source=sourceKeys.get(key);
      const value=source?await ensureShiseiImage(source):((Object.prototype.hasOwnProperty.call(imgCache,key)&&imgCache[key])||await idb.get(key));
      return archiveImageBlob(value);
    },new WritableStream({write(chunk){chunks.push(chunk.slice());},abort(){chunks.length=0;}}),codec,{
      signal:op.controller.signal,onProgress:p=>archiveProgress(op,'正在打包图片 '+p.processed+'/'+p.total,p.processed,p.total)
    });
    if(op.controller.signal.aborted)throw Error('已取消资产包导出');
    downloadBlob(new Blob(chunks,{type:'application/zip'}),'Stillmark_项目包_'+todayStr()+'.stillmark.zip');
    toast('已导出 '+result.projects+' 个策划案 · '+result.uniqueImages+' 张唯一图片');
  }catch(err){toast('项目包未完成：'+String(err.message||err),6000);}
  finally{if(op)finishArchiveOperation(op);}
}
async function previewArchiveImport(file){
  let op=null,opened=null;
  try{
    if(persistConflict||persistClearing||!idb.ready())throw Error('当前无法安全导入，请先备份并刷新');
    op=startArchiveOperation('检查 ZIP 资产包');
    opened=await openAssetArchive(file,archiveCodec(),{signal:op.controller.signal});
    if(op.controller.signal.aborted)throw Error('已取消资产包导入');
    const names=opened.data.entries.slice(0,3).map(p=>p.name).join('、')+(opened.data.entries.length>3?' 等':'');
    const s=opened.stats,session=opened,controller=op.controller;
    finishArchiveOperation(op);op=null;opened=null;
    askConfirm('导入 ZIP 资产包？','将新增 '+s.projects+' 个策划案：'+names+'；'+s.shots+' 条分镜、'+s.images+' 个图片引用（'+s.uniqueImages+' 张唯一图片），'+(s.archiveBytes/1048576).toFixed(2)+' MiB。保留现有数据与收藏。确认后校验全部图片并写入。',()=>applyArchiveImport(session,controller),()=>{controller.abort();session.close().catch(()=>{});});
  }catch(err){if(opened)await opened.close().catch(()=>{});toast('导入失败：'+String(err.message||err),6000);}
  finally{if(op)finishArchiveOperation(op);}
}
async function applyArchiveImport(opened,controller){
  let op=null,locked=false,published=false,session=null;
  const app=document.getElementById('app');
  try{
    if(persistConflict||persistClearing||!idb.ready())throw Error('当前无法安全导入，请先备份并刷新');
    op=startArchiveOperation('导入 ZIP 资产包',controller);
    if(app)app.inert=true;
    if(persistTimer||pendingPersist)await flushPersist();else await persistChain;
    if(persistConflict||persistFailed)throw Error('现有数据尚未保存');
    persistClearing=true;locked=true;
    const generation=persistGeneration,expected=persistExpected;
    session=crypto.randomUUID();
    const map=new Map(opened.manifest.images.map(m=>[m.key,'archive-'+crypto.randomUUID()]));
    const imported=opened.data.entries.map(raw=>{
      const p=sanitizeProject(raw,()=>crypto.randomUUID());
      if(!p)throw Error('文件中有非法项目');
      migrate(p);p.demo=false;p.assetPack=false;p.name=p.name.slice(0,116)+'（导入）';
      const remap=key=>{if(!map.has(key))throw Error('图片依赖缺失');return map.get(key);};
      for(const r of p.refs||[])r.key=remap(r.key);
      for(const m of p.mood||[])if(m.type==='image')m.content=remap(m.content);
      for(const s of p.shots||[])s.refIds=(s.refIds||[]).map(remap);
      return p;
    });
    const arr=JSON.parse(JSON.stringify(loadP())).concat(imported),staged=[];
    const check=()=>{if(op.controller.signal.aborted)throw Error('已取消资产包导入');if(persistConflict||generation!==persistGeneration)throw Error('现有项目已变化，请刷新后重试');};
    check();
    await opened.consumeImages(async(keys,blob)=>{
      check();const value=await archiveDataURL(blob);
      for(const key of keys){
        check();const id=map.get(key);if(!id)throw Error('图片依赖缺失');
        await idb.stageArchiveImage(session,id,value);staged.push(id);
      }
    },p=>archiveProgress(op,'正在校验并暂存图片 '+p.processed+'/'+p.total,p.processed,p.total));
    check();
    if(staged.length!==map.size)throw Error('图片暂存数量不一致');
    op.button.disabled=true;archiveProgress(op,'正在原子保存，暂不可取消…',0,0);
    const ok=await idb.publishArchiveStage(arr,expected,session,staged);
    if(!ok){markPersistConflict();throw Error('其他标签页已修改数据');}
    published=true;persistExpected=JSON.stringify(arr);
    if(generation!==persistGeneration){markPersistConflict();return;}
    projectsCache=arr;pendingPersist=false;persistFailed=false;notifyProjectChange();
    if(document.getElementById('settingsModal').classList.contains('show'))closeSettings();
    view=freshView();renderBoard();toast('导入成功，新增 '+imported.length+' 个策划案');
  }catch(err){toast('导入失败：'+String(err.message||err)+'，原项目未被覆盖',6000);}
  finally{
    await opened.close().catch(()=>{});
    if(session&&!published)await idb.discardArchiveStage(session).catch(()=>{});
    if(locked)persistClearing=false;if(app)app.inert=false;if(op)finishArchiveOperation(op);
  }
}

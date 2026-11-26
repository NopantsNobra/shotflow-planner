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
function archiveCanSaveToFile(){
  return typeof globalThis.showSaveFilePicker==='function'&&globalThis.isSecureContext;
}
async function exportArchiveProjects(entries,scope,direct=false){
  let op=null,sink=null,committed=false;
  try{
    const codec=archiveCodec();
    if(archiveOperation)throw Error('已有资产操作正在进行');
    const filename='Stillmark_项目包_'+todayStr()+'.stillmark.zip';
    // Call the picker in the original click's user activation; never await image
    // reads or run a background task before requesting a destination.
    let handle=null;
    if(direct){
      if(!archiveCanSaveToFile())throw Error('当前浏览器不支持直接保存，请使用普通导出');
      try{handle=await globalThis.showSaveFilePicker({suggestedName:filename,types:[{description:'Stillmark ZIP 资产包',accept:{'application/zip':['.zip']}}]});}
      catch(err){if(err.name==='AbortError'){toast('已取消保存');return;}throw err;}
    }
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
    sink=handle?await handle.createWritable({keepExistingData:false}):new WritableStream({write(chunk){chunks.push(chunk.slice());},abort(){chunks.length=0;}});
    const result=await writeAssetArchive(data,async key=>{
      const source=sourceKeys.get(key);
      const value=source?await ensureShiseiImage(source):((Object.prototype.hasOwnProperty.call(imgCache,key)&&imgCache[key])||await idb.get(key));
      return archiveImageBlob(value);
    },sink,codec,{
      signal:op.controller.signal,onProgress:p=>archiveProgress(op,'正在打包图片 '+p.processed+'/'+p.total,p.processed,p.total)
    });
    committed=true;
    if(!handle){
      if(op.controller.signal.aborted)throw Error('已取消资产包导出');
      downloadBlob(new Blob(chunks,{type:'application/zip'}),filename);
    }
    toast('已导出 '+result.projects+' 个策划案 · '+result.uniqueImages+' 张唯一图片');
  }catch(err){toast('项目包未完成：'+String(err.message||err),6000);}
  finally{
    // The writer already aborts incomplete output; also cover failures before
    // it acquired the sink (schema, hash or early cancellation).
    if(sink&&!committed&&!sink.locked)await sink.abort().catch(()=>{});
    if(op)finishArchiveOperation(op);
  }
}
function archiveTargetLabel(p){
  return (p.name||'未命名项目')+(p.client?' · 客户 '+p.client:'')+(p.shootDate?' · '+p.shootDate:'')+' · ID '+String(p.id||'').slice(0,8);
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
    const summary=s.shots+' 条分镜、'+s.images+' 个图片引用（'+s.uniqueImages+' 张唯一图片），'+(s.archiveBytes/1048576).toFixed(2)+' MiB。确认后校验全部图片并写入。';
    const privacy=session.data.kind==='projects'
      ?'完整项目可能包含客户、拍摄地点、日程、预算、备注和执行状态；确认前请核对是否为授权内容。'
      :'分镜包只包含所选分镜及依赖；追加到现有项目时，不会覆盖其他项目资料或日程。';
    const cancel=()=>{controller.abort();session.close().catch(()=>{});};
    askConfirm('导入 ZIP 资产包？','将新增 '+s.projects+' 个策划案：'+names+'；'+summary+' 保留现有数据与收藏。'+privacy,()=>{
      const target=document.getElementById('archiveImportTarget').value;
      applyArchiveImport(session,controller,target);
    },cancel);
    const picker=document.getElementById('archiveImportTarget'),row=document.getElementById('archiveImportTargetRow');
    if(session.data.kind==='shots'){
      const targets=loadP().filter(p=>!p.demo&&!p.assetPack);
      picker.replaceChildren(new Option('创建新的策划案',''));
      for(const p of targets)picker.add(new Option(archiveTargetLabel(p),p.id));
      row.hidden=false;
      picker.onchange=()=>{
        const target=targets.find(p=>p.id===picker.value);
        document.getElementById('confirmDesc').textContent=target?'向「'+archiveTargetLabel(target)+'」追加 '+summary+' 保留原项目资料、日程及既有分镜。'+privacy:'将新增 1 个策划案：'+names+'；'+summary+' 保留现有数据与收藏。'+privacy;
      };
    }
  }catch(err){if(opened)await opened.close().catch(()=>{});toast('导入失败：'+String(err.message||err),6000);}
  finally{if(op)finishArchiveOperation(op);}
}
/* Versioned boundary adapter: archive data v1 -> current internal Project.
   Keep wire-version handling here instead of making the external schema mirror
   every future internal storage migration. */
function adaptArchiveEntryV1ToProject(raw,options){
  options=options||{};
  const target=options.target||null,needed=options.needed||null,imageMap=options.imageMap;
  const createId=options.createId||(()=>crypto.randomUUID());
  let input=raw;
  if(target){
    const usedScenes=new Set(raw.shots.map(s=>s.sceneId).filter(Boolean)),refs=(raw.refs||[]).filter(x=>needed.has(x.key));
    const have=new Set(refs.map(x=>x.key));
    for(const key of needed)if(!have.has(key))refs.push({key,name:'参考图',tags:[]});
    input={name:raw.name,shots:raw.shots,scenes:(raw.scenes||[]).filter(x=>usedScenes.has(x.id)),refs};
  }
  const project=sanitizeProject(input,createId);
  if(!project)throw Error('文件中有非法项目');
  migrate(project);project.demo=false;project.assetPack=false;project.name=project.name.slice(0,116)+'（导入）';
  const remap=key=>{
    if(!imageMap.has(key))throw Error('图片依赖缺失');
    return imageMap.get(key);
  };
  for(const ref of project.refs||[])ref.key=remap(ref.key);
  for(const mood of project.mood||[])if(mood.type==='image')mood.content=remap(mood.content);
  for(const shot of project.shots||[])shot.refIds=(shot.refIds||[]).map(remap);
  return project;
}
async function applyArchiveImport(opened,controller,targetId=''){
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
    const all=JSON.parse(JSON.stringify(loadP())),target=targetId?all.find(p=>p.id===targetId):null;
    if(targetId&&(!target||target.demo||target.assetPack||opened.data.kind!=='shots'))throw Error('目标项目已不存在或不支持追加');
    // On append, keep only actual shot dependencies. The general project
    // format can also contain unselected metadata supplied by an Agent.
    const needed=target?new Set(opened.data.entries[0].shots.flatMap(s=>s.refIds||[])):null;
    const map=new Map(opened.manifest.images.filter(m=>!needed||needed.has(m.key)).map(m=>[m.key,'archive-'+crypto.randomUUID()]));
    const imported=opened.data.entries.map(raw=>adaptArchiveEntryV1ToProject(raw,{target,needed,imageMap:map}));
    const arr=target?all.map(p=>p.id===targetId?appendArchiveShots(p,imported[0]):p):all.concat(imported),staged=[];
    const check=()=>{if(op.controller.signal.aborted)throw Error('已取消资产包导入');if(persistConflict||generation!==persistGeneration)throw Error('现有项目已变化，请刷新后重试');};
    check();
    await opened.consumeImages(async(keys,blob)=>{
      check();const value=await archiveDataURL(blob);
      for(const key of keys){
        check();const id=map.get(key);if(!id){if(target)continue;throw Error('图片依赖缺失');}
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
    view=freshView();renderBoard();toast(target?'导入成功，已向「'+target.name+'」追加 '+imported[0].shots.length+' 条分镜':'导入成功，新增 '+imported.length+' 个策划案');
  }catch(err){toast('导入失败：'+String(err.message||err)+'，原项目未被覆盖',6000);}
  finally{
    await opened.close().catch(()=>{});
    if(session&&!published)await idb.discardArchiveStage(session).catch(()=>{});
    if(locked)persistClearing=false;if(app)app.inert=false;if(op)finishArchiveOperation(op);
  }
}

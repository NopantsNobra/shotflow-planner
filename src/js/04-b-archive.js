/* Archive writer: codec and sink are injected, so the business model does not
   depend on a specific ZIP implementation or a Blob download. No visual analysis. */
async function archiveSha256(bytes){
  if(!globalThis.crypto?.subtle)throw Error('当前环境不支持资产包完整性校验');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
}
async function writeAssetArchive(data,readImage,sink,codec,options={}){
  const limits=options.limits||assetArchiveLimits(),signal=options.signal;
  const check=()=>{if(signal?.aborted)throw Error('已取消资产包导出');};
  check();
  validatePortableShape(data,assetArchiveDataSchema(),'data');
  const snapshot=JSON.stringify(data),encode=new TextEncoder(),dataBytes=encode.encode(snapshot);
  if(dataBytes.byteLength>limits.maxDataBytes)throw Error('资产包业务数据超过处理上限');
  const model=JSON.parse(snapshot),keys=portableImageKeys(model.entries,model.kind);
  if(keys.size>limits.maxImageRefs||[...keys].some(k=>!k||k.startsWith('shisei:')))throw Error('资产包图片引用非法或超限');
  if(!codec||typeof codec.ZipWriter!=='function'||!sink?.getWriter)throw Error('资产包归档接口不可用');
  const opts={useWebWorkers:false,useCompressionStream:false};
  const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
  const manifest={format:'stillmark.asset-pack',containerVersion:1,dataVersion:1,kind:model.kind,exportedAt:new Date().toISOString(),
    data:{path:'data.json',bytes:dataBytes.byteLength,sha256:await archiveSha256(dataBytes)},images:[]};
  const unique=new Map();
  let expanded=dataBytes.byteLength,archiveBytes=0,logicalBytes=0,complete=false;
  if(expanded>limits.maxExpandedBytes||limits.maxUniqueFiles<2)throw Error('资产包超过处理上限');
  const target=sink.getWriter();
  const bounded=new WritableStream({
    async write(chunk){
      check();archiveBytes+=chunk.byteLength;
      if(archiveBytes>limits.maxArchiveBytes)throw Error('资产包归档体积超过处理上限');
      await target.write(chunk);
    }
  });
  try{
    const writer=new codec.ZipWriter(bounded,opts);
    await writer.add('data.json',new codec.Uint8ArrayReader(dataBytes),{...opts,level:6});
    for(const key of keys){
      check();
      // One logical key is read once; hash exactly the bytes required for the
      // manifest. Keep only descriptors in the index, never a second image cache.
      const blob=await readImage(key);
      const mime=blob?.type,extension=extensions[mime];
      if(!extension||typeof blob.arrayBuffer!=='function'||!Number.isSafeInteger(blob.size)||blob.size<1||blob.size>limits.maxImageBytes)throw Error('图片缺失、格式非法或超过处理上限');
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if(bytes.byteLength!==blob.size)throw Error('图片读取长度不一致');
      check();
      const sha256=await archiveSha256(bytes),path='images/'+sha256+'.'+extension;
      const entry={key,path,bytes:bytes.byteLength,sha256,mime},old=unique.get(sha256);
      if(old&&(old.mime!==mime||old.bytes!==entry.bytes))throw Error('相同摘要的图片描述冲突');
      logicalBytes+=entry.bytes;
      if(!old){
        expanded+=entry.bytes;
        if(expanded>limits.maxExpandedBytes||unique.size+3>limits.maxUniqueFiles)throw Error('资产包超过处理上限');
        await writer.add(path,new codec.Uint8ArrayReader(bytes),{...opts,level:0});
        unique.set(sha256,entry);
      }
      manifest.images.push(entry);
      if(options.onProgress)options.onProgress({processed:manifest.images.length,total:keys.size,unique:unique.size});
    }
    const stats=validateArchiveData(model,manifest,limits);
    const manifestBytes=encode.encode(JSON.stringify(manifest));
    if(manifestBytes.byteLength>limits.maxManifestBytes||expanded+manifestBytes.byteLength>limits.maxExpandedBytes)throw Error('资产包清单或解压体积超过处理上限');
    check();
    await writer.add('manifest.json',new codec.Uint8ArrayReader(manifestBytes),{...opts,level:6});
    await writer.close();
    check();
    await target.close();complete=true;
    return {...stats,archiveBytes,uniqueImages:unique.size,savedImageBytes:logicalBytes-(expanded-dataBytes.byteLength),manifest};
  }finally{
    if(!complete){try{await target.abort();}catch{/* Caller must discard incomplete output. */}}
    target.releaseLock();
  }
}

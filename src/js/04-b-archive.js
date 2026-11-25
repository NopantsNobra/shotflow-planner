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
      const mime=blob?.type,extension=Object.prototype.hasOwnProperty.call(extensions,mime)?extensions[mime]:null;
      if(!extension||typeof blob.arrayBuffer!=='function'||!Number.isSafeInteger(blob.size)||blob.size<1||blob.size>limits.maxImageBytes)throw Error('图片缺失、格式非法或超过处理上限');
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if(bytes.byteLength!==blob.size||!archiveImageSignature(bytes,mime))throw Error('图片读取长度或文件签名不一致');
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

/* Lightweight binary format check, not visual similarity or a full decoder. */
function archiveImageSignature(bytes,mime){
  const at=(offset,text)=>offset+text.length<=bytes.length&&[...text].every((c,i)=>bytes[offset+i]===c.charCodeAt(0));
  const starts=prefix=>prefix.length<=bytes.length&&prefix.every((x,i)=>bytes[i]===x);
  if(mime==='image/png')return starts([137,80,78,71,13,10,26,10]);
  if(mime==='image/jpeg')return starts([255,216,255]);
  if(mime==='image/gif')return at(0,'GIF87a')||at(0,'GIF89a');
  if(mime==='image/webp')return at(0,'RIFF')&&at(8,'WEBP');
  if(mime==='image/avif'&&bytes.length>=16&&at(4,'ftyp')){
    const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
    if(n<16||n>Math.min(bytes.length,4096)||n%4)return false;
    if(at(8,'avif')||at(8,'avis'))return true;
    for(let i=16;i+4<=n;i+=4)if(at(i,'avif')||at(i,'avis'))return true;
  }
  return false;
}
async function readArchiveEntry(entry,expected,options={}){
  if(!entry||entry.uncompressedSize!==expected||!Number.isSafeInteger(expected)||expected<1)throw Error('资产包条目声明大小不一致');
  const signal=options.signal,bytes=new Uint8Array(expected);
  let received=0;
  const check=()=>{if(signal?.aborted)throw Error('已取消资产包读取');};
  check();
  await entry.getData(new WritableStream({write(chunk){
    check();
    if(received+chunk.byteLength>expected)throw Error('资产包条目实际解压字节超限');
    bytes.set(chunk,received);received+=chunk.byteLength;
  }}),{useWebWorkers:false,useCompressionStream:false,checkCrc32:true,checkLocalFilename:true,checkLocalDirectory:true,checkOverlappingEntry:true,signal});
  check();
  if(received!==expected)throw Error('资产包条目实际解压大小不一致');
  return bytes;
}
/* Preflight reads only the bounded directory, manifest and business data.
   Unique verified image files are consumed sequentially after confirmation.
   No extracted file is written to the filesystem or to the live project here. */
async function openAssetArchive(blob,codec,options={}){
  const limits=options.limits||assetArchiveLimits(),signal=options.signal;
  const check=()=>{if(signal?.aborted)throw Error('已取消资产包读取');};
  check();
  if(!blob||!Number.isSafeInteger(blob.size)||blob.size<22||blob.size>limits.maxArchiveBytes||typeof blob.slice!=='function')throw Error('资产包文件大小不合法或超过处理上限');
  if(!codec||typeof codec.ZipReader!=='function')throw Error('资产包归档接口不可用');
  const opts={useWebWorkers:false,useCompressionStream:false,strictness:'strict',checkCrc32:true};
  const reader=new codec.ZipReader(new codec.BlobReader(blob),opts);
  const entries=new Map();let expanded=0,folder=false,closed=false,consumed=false;
  const close=async()=>{if(!closed){closed=true;await reader.close();}};
  try{
    for await(const e of reader.getEntriesGenerator()){
      check();
      const name=e.filename,isFolder=name==='images/'&&e.directory;
      const raw=e.rawFilename;
      if(typeof name!=='string'||name.length>100||!raw||raw.length!==name.length||!Array.from(raw).every((v,i)=>v===name.charCodeAt(i)))throw Error('资产包文件路径非法');
      if(e.encrypted||e.symlink||e.diskNumberStart!==0||![0,8].includes(e.compressionMethod))throw Error('资产包含不支持的归档条目');
      if(isFolder){
        if(folder||e.uncompressedSize!==0||e.compressedSize!==0)throw Error('资产包目录非法或重复');
        folder=true;continue;
      }
      const image=/^images\/[0-9a-f]{64}\.(jpg|png|webp|gif|avif)$/.test(name);
      if(e.directory||(!image&&name!=='manifest.json'&&name!=='data.json')||entries.has(name))throw Error('资产包文件路径非法、重复或未声明');
      const limit=name==='manifest.json'?limits.maxManifestBytes:name==='data.json'?limits.maxDataBytes:limits.maxImageBytes;
      if(!Number.isSafeInteger(e.uncompressedSize)||e.uncompressedSize<1||e.uncompressedSize>limit||!Number.isSafeInteger(e.compressedSize)||e.compressedSize<1||e.compressedSize>blob.size||(e.compressionMethod===0&&e.compressedSize!==e.uncompressedSize))throw Error('资产包条目大小不合法或超过处理上限');
      entries.set(name,e);expanded+=e.uncompressedSize;
      if(entries.size>limits.maxUniqueFiles||expanded>limits.maxExpandedBytes)throw Error('资产包条目数或展开体积超过处理上限');
    }
    const manifestEntry=entries.get('manifest.json');
    if(!manifestEntry)throw Error('资产包清单缺失');
    const decode=new TextDecoder('utf-8',{fatal:true});
    const manifest=JSON.parse(decode.decode(await readArchiveEntry(manifestEntry,manifestEntry.uncompressedSize,options)));
    const checked=validateArchiveManifest(manifest,limits);
    if(checked.files.size+1!==entries.size)throw Error('资产包归档目录与清单不一致');
    for(const [path,descriptor] of checked.files)if(!entries.has(path)||entries.get(path).uncompressedSize!==descriptor.bytes)throw Error('资产包清单文件缺失或大小不一致');
    const dataBytes=await readArchiveEntry(entries.get('data.json'),manifest.data.bytes,options);
    if(await archiveSha256(dataBytes)!==manifest.data.sha256)throw Error('资产包业务数据摘要不一致');
    const data=JSON.parse(decode.decode(dataBytes)),stats=validateArchiveData(data,manifest,limits);
    const groups=new Map();
    for(const im of manifest.images){
      if(!groups.has(im.path))groups.set(im.path,[]);
      groups.get(im.path).push(im);
    }
    // The reader is single-use; import code must discard any staging on error.
    const consumeImages=async(onImage,onProgress)=>{
      if(closed||consumed||typeof onImage!=='function')throw Error('资产包读取会话已关闭或已使用');
      consumed=true;let count=0;
      try{
        for(const [path,group] of groups){
          check();
          const im=group[0],bytes=await readArchiveEntry(entries.get(path),im.bytes,options);
          if(!archiveImageSignature(bytes,im.mime)||await archiveSha256(bytes)!==im.sha256)throw Error('资产包图片签名或摘要不一致');
          check();
          await onImage(group.map(x=>x.key),new Blob([bytes],{type:im.mime}),{...im});
          if(onProgress)onProgress({processed:++count,total:groups.size});
        }
      }finally{await close();}
    };
    // Do not expose mutable objects used by the validation/consumption closure.
    return {manifest:JSON.parse(JSON.stringify(manifest)),data:JSON.parse(JSON.stringify(data)),stats:{...stats,uniqueImages:groups.size,archiveBytes:blob.size},consumeImages,close};
  }catch(error){await close();throw error;}
}

import { test, expect } from '@playwright/test';

/* Real raster payloads, deterministic and generated on demand. No padding,
   Base64 fixture explosion, external network or all-image source array.
   Set ZIP_SCALE_COUNT=300 for a ~90 MiB desktop stress run. */
const count=Number(process.env.ZIP_SCALE_COUNT||100);
if(!Number.isInteger(count)||count<10||count>350)throw Error('ZIP_SCALE_COUNT must be 10..350');

test('ZIP 容量回归：真实栅格图片逐张写入、预览、暂存、原子导入与刷新',async({page},testInfo)=>{
  test.setTimeout(180000);
  await page.goto('/shotflow.html');
  await expect(page.locator('.pcard').first()).toBeVisible();
  const result=await page.evaluate(async(count)=>{
    if(persistTimer||pendingPersist)await flushPersist();else await persistChain;
    const original=await idb.getProjects(),beforeKeys=await idb.keys();
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=256;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);
    const refs=Array.from({length:count},(_,i)=>({id:'ref-'+i,key:'image-'+i,name:'图 '+i,tags:['压测']}));
    // A second logical key refers to the exact same bytes as the first.
    refs.push({id:'ref-alias',key:'alias',name:'相同内容另一引用',tags:['别名']});
    const model={dataVersion:1,kind:'projects',entries:[{name:'ZIP 容量回归',refs,shots:[{name:'校验分镜',refIds:['image-0','alias','image-'+(count-1)]}]}]};
    const parts=[],sampleDigests={};let reads=0,progress=0,maxChunk=0;
    const start=performance.now();
    const stats=await writeAssetArchive(model,async key=>{
      const index=key==='alias'?0:Number(key.slice(6));
      let seed=(index+1)*123456789>>>0;
      for(let i=0;i<pixels.data.length;i+=4){
        seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
        pixels.data[i]=seed&255;pixels.data[i+1]=(seed>>>8)&255;pixels.data[i+2]=(seed>>>16)&255;pixels.data[i+3]=255;
      }
      ctx.putImageData(pixels,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('fixture PNG encoding failed');
      if(index===0||index===count-1)sampleDigests[key]=await archiveSha256(new Uint8Array(await blob.arrayBuffer()));
      reads++;return blob;
    },new WritableStream({write(chunk){maxChunk=Math.max(maxChunk,chunk.byteLength);parts.push(chunk.slice());}}),globalThis.zip,{onProgress:p=>{progress=p.processed;}});
    const blob=new Blob(parts,{type:'application/zip'});parts.length=0;
    const writeMs=Math.round(performance.now()-start),t=performance.now();
    await previewArchiveImport(new File([blob],'capacity.stillmark.zip',{type:'application/zip'}));
    const previewMs=Math.round(performance.now()-t);
    const unchanged=JSON.stringify(original)===JSON.stringify(await idb.getProjects())&&JSON.stringify(beforeKeys)===JSON.stringify(await idb.keys());
    window.__capacity={originalCount:original.length,beforeKeys:beforeKeys.length,sampleDigests,count,started:performance.now()};
    return {count,reads,progress,maxChunk,writeMs,previewMs,bytes:blob.size,unique:stats.uniqueImages,saved:stats.savedImageBytes,unchanged};
  },count);
  expect(result.unchanged).toBe(true);
  expect(result.reads).toBe(count+1);expect(result.progress).toBe(count+1);
  expect(result.unique).toBe(count);expect(result.saved).toBeGreaterThan(100000);
  expect(result.bytes).toBeGreaterThan(count*200000);
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await page.locator('#confirmOk').click();
  await expect(page.locator('#archiveProgressModal')).not.toHaveClass(/show/,{timeout:120000});
  await expect(page.locator('.pcard',{hasText:'ZIP 容量回归'})).toBeVisible();
  const imported=await page.evaluate(async()=>{
    const expected=window.__capacity,projects=await idb.getProjects(),p=projects.find(p=>p.name.startsWith('ZIP 容量回归'));
    const keys=await idb.keys(),shot=p.shots[0];
    const digests=[];
    for(const key of shot.refIds){
      const blob=await archiveImageBlob(await idb.get(key));
      digests.push(await archiveSha256(new Uint8Array(await blob.arrayBuffer())));
    }
    return {importMs:Math.round(performance.now()-expected.started),projects:projects.length-expected.originalCount,
      imageRecords:keys.length-expected.beforeKeys,staging:keys.filter(Array.isArray).length,refs:p.refs.length,
      correct:digests[0]===expected.sampleDigests['image-0']&&digests[1]===expected.sampleDigests.alias&&digests[2]===expected.sampleDigests['image-'+(expected.count-1)],
      distinctKeys:new Set(shot.refIds).size,cache:shot.refIds.filter(k=>Object.prototype.hasOwnProperty.call(imgCache,k)).length};
  });
  expect(imported).toMatchObject({projects:1,imageRecords:count+1,staging:0,refs:count+1,correct:true,distinctKeys:3,cache:0});
  console.log('[ZIP-CAPACITY] '+JSON.stringify({browser:testInfo.project.name,...result,...imported}));
  await page.reload();
  await expect(page.locator('.pcard',{hasText:'ZIP 容量回归'})).toBeVisible();
  expect(await page.evaluate(async()=>{
    const p=(await idb.getProjects()).find(p=>p.name.startsWith('ZIP 容量回归'));
    return !!(await idb.get(p.shots[0].refIds[0]));
  })).toBe(true);
});

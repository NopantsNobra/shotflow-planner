import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const bundle=readFileSync(new URL('../../src/vendor/zip-native-2.25.0.min.js',import.meta.url),'utf8');
const externalFixture='UEsDBBQAAAAIAEGUeV1RpGy1IwAAACEAAAANAAAAbWFuaWZlc3QuanNvbqtWSssvyk0sUbJSKi7JzMnJTSzK1kssLk4t0S1ITM5WqgUAUEsDBBQAAAAAAEGUeV1Y+DV7BQAAAAUAAAAPAAAAaW1hZ2VzL3Rlc3QuYmluAAECA/9QSwECFAMUAAAACABBlHldUaRstSMAAAAhAAAADQAAAAAAAAAAAAAAgAEAAAAAbWFuaWZlc3QuanNvblBLAQIUAxQAAAAAAEGUeV1Y+DV7BQAAAAUAAAAPAAAAAAAAAAAAAACAAU4AAABpbWFnZXMvdGVzdC5iaW5QSwUGAAAAAAIAAgB4AAAAgAAAAAAA';

async function probe(externalFixture){
  const bytes=Uint8Array.of(0,1,2,3,255);
  const options={useWebWorkers:false,useCompressionStream:false};
  const z=globalThis.zip;
  z.configure(options);
  const sink=[];
  const writer=new z.ZipWriter(new WritableStream({write(chunk){sink.push(new Uint8Array(chunk));}}),{...options,zip64:true});
  await writer.add('manifest.json',new z.TextReader('{"format":"stillmark.asset-pack"}'),{level:6,zip64:true});
  await writer.add('images/test.bin',new z.Uint8ArrayReader(bytes),{level:0,zip64:true});
  await writer.close();
  const resultBlob=new Blob(sink,{type:'application/zip'});
  const read=async(blob)=>{
    const reader=new z.ZipReader(new z.BlobReader(blob),{...options,strictness:'strict',checkCrc32:true});
    try{
      const entries=await reader.getEntries();
      const meta=entries.find(e=>e.filename==='manifest.json'),image=entries.find(e=>e.filename==='images/test.bin');
      const manifest=await meta.getData(new z.TextWriter(),{...options,checkCrc32:true});
      const payload=await image.getData(new z.Uint8ArrayWriter(),{...options,checkCrc32:true});
      return {manifest,bytes:Array.from(payload),methods:[meta.compressionMethod,image.compressionMethod],count:entries.length};
    }finally{await reader.close();}
  };
  const generated=await read(resultBlob);
  const external=await read(new Blob([Uint8Array.from(atob(externalFixture),c=>c.charCodeAt(0))]));
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  return {generated,external,sha,chunks:sink.length,size:resultBlob.size,secureContext:isSecureContext};
}
const script=bundle+'\n('+probe.toString()+')('+JSON.stringify(externalFixture)+').then(result=>{document.getElementById("result").textContent=JSON.stringify(result);},error=>{document.getElementById("result").textContent=JSON.stringify({error:String(error),stack:error.stack});});';
const hash=createHash('sha256').update(script).digest('base64');
const policy="default-src 'none'; script-src 'sha256-"+hash+"'; script-src-attr 'none'; worker-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
const html='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"></head><body><pre id="result">pending</pre><script>'+script+'</script></body></html>';

for(const mode of ['local-file','localhost']){
  test('ZIP 原型：严格 CSP、'+mode+'、无 Worker/WASM 的 ZIP64 与二进制往返',async({page},testInfo)=>{
    const requests=[],violations=[],errors=[];
    page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().endsWith('/__zip_probe.html'))requests.push(r.url());});
    page.on('pageerror',e=>errors.push(String(e)));
    await page.addInitScript(()=>{
      window.__zipCsp=[];
      document.addEventListener('securitypolicyviolation',e=>window.__zipCsp.push(e.effectiveDirective+': '+e.blockedURI));
    });
    if(mode==='local-file'){
      const path=testInfo.outputPath('zip-probe.html');
      mkdirSync(dirname(path),{recursive:true});writeFileSync(path,html);
      await page.goto(pathToFileURL(path).href);
    }else{
      await page.route('**/__zip_probe.html',r=>r.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));
      await page.goto('/__zip_probe.html');
    }
    await expect(page.locator('#result')).not.toHaveText('pending',{timeout:15000});
    const result=JSON.parse(await page.locator('#result').textContent());
    expect(result.error,result.stack).toBeUndefined();
    const want={manifest:'{"format":"stillmark.asset-pack"}',bytes:[0,1,2,3,255],methods:[8,0],count:2};
    expect(result.generated).toEqual(want);expect(result.external).toEqual(want);
    expect(result.sha).toBe(createHash('sha256').update(Buffer.from([0,1,2,3,255])).digest('hex'));
    expect(result.chunks).toBeGreaterThan(1);
    expect(result.secureContext).toBe(true);
    violations.push(...await page.evaluate(()=>window.__zipCsp||[]));
    expect(violations).toEqual([]);expect(errors).toEqual([]);expect(requests).toEqual([]);
  });
}

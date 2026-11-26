/* ===== 外部交换格式的权威 Schema 定义 =====
 * 这里定义版本化的 wire contract；内部 Project 模型可独立演进，
 * 导入器负责把外部版本适配为当前内部模型。
 * schemas/*.schema.json 由 scripts/export-schemas.mjs 从这些定义生成。
 */
function portablePackSchema(){
  const str=(maxLength,minLength=0)=>({type:'string',maxLength,minLength});
  const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
  const num={type:'number',minimum:0,maximum:Number.MAX_SAFE_INTEGER};
  const bool={type:'boolean'},id=str(200,1),tag=str(120,1),tags={type:'array',items:tag,maxItems:5000};
  const date={type:'string',pattern:'^(?:[0-9]{4}-[0-9]{2}-[0-9]{2})?$'};
  const time={type:'string',pattern:'^(?:[01][0-9]:[0-5][0-9]|2[0-3]:[0-5][0-9])?$'};
  const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
  const arr=(items,maxItems=5000)=>({type:'array',items,maxItems});
  const dates=arr({type:'string',pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'},3660);
  const module={enum:['concept','mood','shots','schedule','stuff','budget','notes']};
  const shot=obj({id,name:str(200,1),date,slot:time,duration:{type:['integer','null'],minimum:5,maximum:1440},sceneId:str(200),refIds:arr(id,3),position:str(20),light:str(20),note:str(1000),done:bool,mustShoot:bool,skipped:bool,deferred:bool,ord:integer(0,1000000000),fav:bool},['name']);
  const scene=obj({id,name:str(120,1),note:str(1000),done:bool,fav:bool},['name']);
  const ref=obj({id,key:id,name:str(120),tags,createdAt:num,fav:bool},['key']);
  const mood=obj({id,type:{enum:['text','color','image']},content:str(4000),tag:str(120),tags,autoTags:tags,fav:bool},['type','content']);
  const schedule=obj({id,type:str(20),title:str(200,1),start:time,end:time,note:str(1000),date,done:bool,fav:bool,timeLocked:bool,auto:{enum:[null,'call','wrap']}},['title']);
  const project=obj({
    id,name:str(120,1),client:str(120),studio:str(120),status:{enum:['灵感期','策划中','待拍摄','后期中','已交付','已归档']},location:str(120),
    lat:{type:['string','number'],maxLength:32},lng:{type:['string','number'],maxLength:32},timeZone:str(80),workspaceMode:{enum:['casual','portrait','professional','custom']},workspaceCustom:arr(module,7),
    v3:{const:1},v9:{type:'integer'},demo:{const:false},assetPack:{const:false},createdAt:num,updatedAt:num,shootDate:date,shootDates:dates,dayInit:dates,
    concept:obj({theme:str(200),model:str(200),style:str(200),audience:str(200),usage:str(200),note:str(4000)}),
    tagVocab:tags,shots:arr(shot),scenes:arr(scene),refs:arr(ref),mood:arr(mood),schedule:arr(schedule),
    items:arr(obj({id,kind:{enum:['服装道具','器材']},name:str(120,1),note:str(500),done:bool,fav:bool},['name'])),
    budget:arr(obj({id,item:str(120,1),cat:str(20),amount:{type:'number',minimum:0,maximum:999999999},paid:bool,fav:bool},['item'])),
    notes:arr(obj({id,kind:str(20),content:str(4000),ts:num,fav:bool},['content'])),
    todos:arr(obj({id,title:str(200,1),owner:str(60),due:date,done:bool,fav:bool},['title']))
  },['name']);
  return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Stillmark portable project package v1',
    ...obj({app:{const:'stillmark'},version:{const:5},type:{const:'project-pack'},packVersion:{const:1},scope:{enum:['projects','shots']},exportedAt:str(40),
      entries:{type:'array',items:project,minItems:1,maxItems:200},
      images:{type:'object',maxProperties:10000,propertyNames:str(200,1),additionalProperties:{type:'string',maxLength:8388608,pattern:'^data:image/'}}},['app','version','type','packVersion','entries','images'])};
}
function assetArchiveManifestSchema(){
  const sha256={type:'string',pattern:'^[0-9a-f]{64}$'};
  const bytes={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
  const obj=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
  const image=obj({key:{type:'string',minLength:1,maxLength:200},path:{type:'string',pattern:'^images/[0-9a-f]{64}\\.(jpg|png|webp|gif|avif)$'},bytes,sha256,mime:{enum:['image/jpeg','image/png','image/webp','image/gif','image/avif']}});
  return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Stillmark asset archive manifest v1',
    ...obj({format:{const:'stillmark.asset-pack'},containerVersion:{const:1},dataVersion:{const:1},kind:{enum:['projects','shots']},
      exportedAt:{type:'string',maxLength:40,pattern:'^[0-9]{4}-[0-9]{2}-[0-9]{2}T'},
      data:obj({path:{const:'data.json'},bytes,sha256}),images:{type:'array',items:image}})};
}
function assetArchiveDataSchema(){
  return {$schema:'https://json-schema.org/draft/2020-12/schema',title:'Stillmark asset archive business data v1',
    type:'object',additionalProperties:false,required:['dataVersion','kind','entries'],
    properties:{dataVersion:{const:1},kind:{enum:['projects','shots']},entries:portablePackSchema().properties.entries}};
}

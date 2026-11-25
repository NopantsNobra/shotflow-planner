/* ================= 数据层 ================= */
/* ===== 版本与反馈：APP_VERSION 由构建注入（scripts/assemble.mjs 在 src → 产物阶段把下方的
   版本占位字面量替换为 package.json 的版本号）；MODULE_VERSIONS 记录各 src/ 模块「最后实质变更」
   的应用版本（自 v10.5.0 源码模块化起记录，发版时按 CONTRIBUTING.md 检查单同步）；FB_KEY_A/B
   为反馈表单服务 access key 的混淆配置（双层编码，运行时由 06-settings.js 还原，
   源码/配置/产物/日志均无明文）。
   注意：注释中不要复现带引号的占位字面量本身，
   否则构建注入会命中注释而非代码（replace 只替换首个出现）===== */
const APP_VERSION='__APP_VERSION__';
const MODULE_VERSIONS={shell:'v10.9.1',styles:'v10.9.2',data:'v10.9.3',core:'v10.9.3',app:'v10.9.2',output:'v10.9.3',boot:'v10.9.2',settings:'v10.9.3',swCache:'shotflow-v10-25-portable',dbSchema:4,since:'v10.5.0'};
const FB_KEY_A = 'uJrHd8a=U+X9Uh3EUtyyUhdF';
const FB_KEY_B = 'yRhU1RHdTUVl1XwU9dVu=mJD';
const LS_PROJ='wb_sf_projects', LS_SEED='wb_sf_seeded', LS_DEMO_V9='wb_sf_demo_v9';
const FAV_KINDS=['mood','shots','schedule','scenes','items','budget','notes','todos'];
const FAV_META={mood:'情绪板',shots:'分镜',schedule:'日程',scenes:'清单',items:'清单',budget:'预算',notes:'协作',todos:'协作'};
const FAV_ICON={mood:'▣',shots:'▤',schedule:'◷',scenes:'◎',items:'◈',budget:'¥',notes:'✉',todos:'✓'};
const FAV_TAB={mood:'mood',shots:'shots',schedule:'schedule',scenes:'stuff',items:'stuff',budget:'budget',notes:'notes',todos:'notes'};
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const jstr=s=>esc(JSON.stringify(String(s==null?'':s)));   // 安全注入内联事件参数
/* P2 安全加固：颜色值白名单校验。仅允许 hex / rgb() / hsl() 字面量，其余回退默认色。
   esc() 只做 HTML 属性转义，无法阻挡 CSS 上下文注入（如 `red;position:fixed`），故需此函数。
   纯函数、无外部依赖，可被逻辑测试直接抽取。 */
function safeColor(v){
  const s=String(v==null?'':v).trim();
  if(/^#[0-9a-fA-F]{3}$/.test(s)||/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  const c255='(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';       // 0-255
  const c360='(?:360|3[0-5]\\d|2\\d\\d|1?\\d?\\d)';   // 0-360（色相，含 360 边界）
  const c100='(?:100|\\d?\\d)';                        // 0-100（百分比）
  const alpha='(?:0|1|0?\\.\\d+)';                     // 0-1
  const rgb='rgb\\(\\s*'+c255+'\\s*,\\s*'+c255+'\\s*,\\s*'+c255+'\\s*\\)';
  const rgba='rgba\\(\\s*'+c255+'\\s*,\\s*'+c255+'\\s*,\\s*'+c255+'\\s*,\\s*'+alpha+'\\s*\\)';
  const hsl='hsl\\(\\s*'+c360+'\\s*,\\s*'+c100+'%\\s*,\\s*'+c100+'%\\s*\\)';
  if(new RegExp('^'+rgb+'$').test(s)) return s;
  if(new RegExp('^'+rgba+'$').test(s)) return s;
  if(new RegExp('^'+hsl+'$').test(s)) return s;
  return '#c8a97e';
}

/* ===== 素材标签：常量与会话配置 ===== */
const AI_TAGGING_ENABLED=false;                 // 编译期总开关，本期恒关闭
const TagProviders=Object.create(null);         // 可插拔建议器注册表，默认空
let aiConfig=(()=>{                             // 仅内存 + sessionStorage，不入库不导出
  const def={enabled:false,endpoint:'',apiKey:'',model:'',timeoutMs:8000};
  try{ return Object.assign(def,JSON.parse(sessionStorage.getItem('sf_ai_cfg_v1'))||{}); }
  catch{ return def; }
})();
const MATERIAL_SOURCES=[
  {name:'shisei · 人像姿势参考',url:'https://github.com/wquguru/shisei',
    lic:'图片 CC0 1.0 · 代码 Apache-2.0',
    note:'280 姿势 × 5 视角，四语说明；线稿整包约 36.5MB。可下载后从「上传图片」导入本项目。'},
  {name:'RuiC-PoseAtlas · AI 人台线稿',url:'https://github.com/HRuiCcc/RuiC-PoseAtlas',
    lic:'代码 MIT · 图片版权归原作者',
    note:'288 组 / 1439 张，仓库约 798MB。仅作外链浏览参考。'},
  {name:'alt-cinematography-reference · 分类维度参考',url:'https://github.com/patipanpealt/alt-cinematography-reference',
    lic:'无许可证 · 仅借鉴分类维度',
    note:'6 部分 53 项摄影语法（景别 / 机位 / 运动 / 光线 / 构图），含 25 张 WebP 照片。仅借鉴分类维度做标签词表，不复制仓库内容。'}
];
const TAG_SUGGESTIONS=[
  '站姿','坐姿','行走','回眸','侧身','倚靠','手部动作','跳跃','蹲姿',
  '远景','全景','中景','近景','特写','大特写',
  '平视','俯拍','仰拍','过肩','低机位','鸟瞰',
  '顺光','侧光','侧逆光','逆光','顶光','窗光','黄金时刻','剪影',
  '居中','三分法','引导线','框架构图','留白','对称',
  '胶片感','暖调','冷调','松弛感','生活流','氛围感'
];
/* v10：分镜「机位」「光线」固定选项（不进 tagVocab，避免污染素材标签词表） */
const POSITION_OPTS=['平视','俯拍','仰拍','过肩','低机位','鸟瞰','侧背','正面'];
const LIGHT_OPTS=['顺光','侧光','侧逆光','逆光','顶光','窗光','黄金时刻','剪影','蓝调'];

/* ===== 提案出版系统：画廊扉页封面 + 统一文档排版 ===== */
const CV_DIAMOND = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 1500' fill='none'><path d='M-2000,-3500 L2000,500 M-2000,-3460 L2000,540 M-2000,-3420 L2000,580 M-2000,-3380 L2000,620 M-2000,-3340 L2000,660 M-2000,-3300 L2000,700 M-2000,-3260 L2000,740 M-2000,-3220 L2000,780 M-2000,-3180 L2000,820 M-2000,-3140 L2000,860 M-2000,-3100 L2000,900 M-2000,-3060 L2000,940 M-2000,-3020 L2000,980 M-2000,-2980 L2000,1020 M-2000,-2940 L2000,1060 M-2000,-2900 L2000,1100 M-2000,-2860 L2000,1140 M-2000,-2820 L2000,1180 M-2000,-2780 L2000,1220 M-2000,-2740 L2000,1260 M-2000,-2700 L2000,1300 M-2000,-2660 L2000,1340 M-2000,-2620 L2000,1380 M-2000,-2580 L2000,1420 M-2000,-2540 L2000,1460 M-2000,-2500 L2000,1500 M-2000,-2460 L2000,1540 M-2000,-2420 L2000,1580 M-2000,-2380 L2000,1620 M-2000,-2340 L2000,1660 M-2000,-2300 L2000,1700 M-2000,-2260 L2000,1740 M-2000,-2220 L2000,1780 M-2000,-2180 L2000,1820 M-2000,-2140 L2000,1860 M-2000,-2100 L2000,1900 M-2000,-2060 L2000,1940 M-2000,-2020 L2000,1980 M-2000,-1980 L2000,2020 M-2000,-1940 L2000,2060 M-2000,-1900 L2000,2100 M-2000,-1860 L2000,2140 M-2000,-1820 L2000,2180 M-2000,-1780 L2000,2220 M-2000,-1740 L2000,2260 M-2000,-1700 L2000,2300 M-2000,-1660 L2000,2340 M-2000,-1620 L2000,2380 M-2000,-1580 L2000,2420 M-2000,-1540 L2000,2460 M-2000,-1500 L2000,2500 M-2000,-1460 L2000,2540 M-2000,-1420 L2000,2580 M-2000,-1380 L2000,2620 M-2000,-1340 L2000,2660 M-2000,-1300 L2000,2700 M-2000,-1260 L2000,2740 M-2000,-1220 L2000,2780 M-2000,-1180 L2000,2820 M-2000,-1140 L2000,2860 M-2000,-1100 L2000,2900 M-2000,-1060 L2000,2940 M-2000,1900 L2000,-2100 M-2000,1940 L2000,-2060 M-2000,1980 L2000,-2020 M-2000,2020 L2000,-1980 M-2000,2060 L2000,-1940 M-2000,2100 L2000,-1900 M-2000,2140 L2000,-1860 M-2000,2180 L2000,-1820 M-2000,2220 L2000,-1780 M-2000,2260 L2000,-1740 M-2000,2300 L2000,-1700 M-2000,2340 L2000,-1660 M-2000,2380 L2000,-1620 M-2000,2420 L2000,-1580 M-2000,2460 L2000,-1540 M-2000,2500 L2000,-1500 M-2000,2540 L2000,-1460 M-2000,2580 L2000,-1420 M-2000,2620 L2000,-1380 M-2000,2660 L2000,-1340 M-2000,2700 L2000,-1300 M-2000,2740 L2000,-1260 M-2000,2780 L2000,-1220 M-2000,2820 L2000,-1180 M-2000,2860 L2000,-1140 M-2000,2900 L2000,-1100 M-2000,2940 L2000,-1060 M-2000,2980 L2000,-1020 M-2000,3020 L2000,-980 M-2000,3060 L2000,-940 M-2000,3100 L2000,-900 M-2000,3140 L2000,-860 M-2000,3180 L2000,-820 M-2000,3220 L2000,-780 M-2000,3260 L2000,-740 M-2000,3300 L2000,-700 M-2000,3340 L2000,-660 M-2000,3380 L2000,-620 M-2000,3420 L2000,-580 M-2000,3460 L2000,-540 M-2000,3500 L2000,-500 M-2000,3540 L2000,-460 M-2000,3580 L2000,-420 M-2000,3620 L2000,-380 M-2000,3660 L2000,-340 M-2000,3700 L2000,-300 M-2000,3740 L2000,-260 M-2000,3780 L2000,-220 M-2000,3820 L2000,-180 M-2000,3860 L2000,-140 M-2000,3900 L2000,-100 M-2000,3940 L2000,-60 M-2000,3980 L2000,-20 M-2000,4020 L2000,20 M-2000,4060 L2000,60 M-2000,4100 L2000,100 M-2000,4140 L2000,140 M-2000,4180 L2000,180 M-2000,4220 L2000,220 M-2000,4260 L2000,260 M-2000,4300 L2000,300 M-2000,4340 L2000,340 M-2000,4380 L2000,380 M-2000,4420 L2000,420 M-2000,4460 L2000,460 M-2000,4500 L2000,500 M-2000,4540 L2000,540' stroke='#8A8076' stroke-width='0.6' stroke-opacity='0.1' stroke-linecap='butt'/><path d='M-2000,-3500 L2000,500 M-2000,-3340 L2000,660 M-2000,-3180 L2000,820 M-2000,-3020 L2000,980 M-2000,-2860 L2000,1140 M-2000,-2700 L2000,1300 M-2000,-2540 L2000,1460 M-2000,-2380 L2000,1620 M-2000,-2220 L2000,1780 M-2000,-2060 L2000,1940 M-2000,-1900 L2000,2100 M-2000,-1740 L2000,2260 M-2000,-1580 L2000,2420 M-2000,-1420 L2000,2580 M-2000,-1260 L2000,2740 M-2000,-1100 L2000,2900 M-2000,1900 L2000,-2100 M-2000,2060 L2000,-1940 M-2000,2220 L2000,-1780 M-2000,2380 L2000,-1620 M-2000,2540 L2000,-1460 M-2000,2700 L2000,-1300 M-2000,2860 L2000,-1140 M-2000,3020 L2000,-980 M-2000,3180 L2000,-820 M-2000,3340 L2000,-660 M-2000,3500 L2000,-500 M-2000,3660 L2000,-340 M-2000,3820 L2000,-180 M-2000,3980 L2000,-20 M-2000,4140 L2000,140 M-2000,4300 L2000,300 M-2000,4460 L2000,460' stroke='#8A8076' stroke-width='0.9' stroke-opacity='0.16' stroke-linecap='butt'/></svg>`;

const PUBLIC_STYLE = `
:root{--paper:#F5F2EC;--pub-ink:#2B2A27;--pub-mute:#9C9389;--pub-line:rgba(138,128,118,.5);--pub-serif:"Noto Serif SC","Songti SC","STSong",Georgia,serif;--pub-sans:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;}
.cv-fit{position:relative;width:100%;height:1091px;overflow:hidden}
.cv-sheet{position:absolute;left:0;top:0;width:1080px;height:1620px;background:var(--paper);transform-origin:top left;overflow:hidden;font-family:var(--pub-sans);color:var(--pub-ink)}
.cv-sheet *{box-sizing:border-box}
.cv-diamond{position:absolute;left:60px;top:60px;width:960px;height:1500px}
.cv-diamond svg{display:block;width:100%;height:100%}
.cv-rule{position:absolute;left:90px;width:900px;height:1px;background:var(--pub-line)}
.cv-rule.head{top:190px}.cv-rule.foot{top:1440px}
.cv-eyebrow{position:absolute;top:140px;height:36px;line-height:36px;font-size:26px;font-weight:300;letter-spacing:5px;color:var(--pub-mute);white-space:nowrap}
.cv-eyebrow.l{left:90px}.cv-eyebrow.r{right:90px}
.cv-title{position:absolute;left:90px;top:540px;width:900px;font-family:var(--pub-serif);font-size:130px;font-weight:500;line-height:1.25;letter-spacing:6px;white-space:nowrap}
.cv-subtitle{position:absolute;left:90px;top:802px;font-size:24px;font-weight:300;letter-spacing:7px;color:var(--pub-mute);white-space:nowrap}
.cv-col{position:absolute;top:1050px;width:300px}
.cv-col.c1{left:90px}.cv-col.c2{left:390px}.cv-col.c3{left:690px}
.cv-col .crule{width:300px;height:1px;background:rgba(138,128,118,.55)}
.cv-col .clabel{margin-top:26px;font-size:24px;font-weight:300;letter-spacing:3px;color:var(--pub-mute);white-space:nowrap}
.cv-col .cvalue{margin-top:14px;font-family:var(--pub-serif);font-size:38px;font-weight:400;letter-spacing:1px;white-space:nowrap}
.cv-vsep{position:absolute;top:1050px;width:1px;height:150px;background:rgba(138,128,118,.35)}
.cv-vsep.v1{left:375px}.cv-vsep.v2{left:675px}
.cv-foot{position:absolute;top:1470px;font-size:26px;font-weight:300;letter-spacing:3px;color:var(--pub-mute);white-space:nowrap}
.cv-foot.l{left:90px;width:520px}.cv-foot.r{right:90px;width:360px;text-align:right}
#docModal .modal{padding:0;background:var(--paper);overflow:auto}
#docModal .no-print{margin:14px 18px 0}
.doc{font-family:var(--pub-sans);color:var(--pub-ink);padding:18px 34px 34px}
.doc h1{font-family:var(--pub-serif);font-size:30px;font-weight:500;letter-spacing:4px;text-align:left;margin-bottom:6px}
.doc .doc-sub{text-align:left;font-size:13px;letter-spacing:2px;color:var(--pub-mute);margin-bottom:22px}
.doc h2{font-family:var(--pub-serif);font-size:19px;font-weight:500;letter-spacing:2px;border-bottom:1px solid var(--pub-line);padding-bottom:9px;margin:28px 0 14px}
.doc table{width:100%;border-collapse:collapse;font-size:13px}
.doc td,.doc th{border:1px solid #ded6ca;padding:8px 10px;text-align:left}
.doc .kv{display:grid;grid-template-columns:100px 1fr;gap:9px 16px;font-size:14px}
.doc .kv dt{color:var(--pub-mute)}
.doc img{max-width:120px;border-radius:6px;margin:4px;border:1px solid #ded6ca}
.doc .swatch{display:inline-block;width:38px;height:38px;border-radius:6px;margin:4px;vertical-align:middle;border:1px solid #ded6ca}
.doc .muted{color:var(--pub-mute);font-size:12px}
.doc .ft{text-align:center;color:var(--pub-mute);font-size:11px;letter-spacing:2px;margin-top:28px}
.imgs{display:flex;flex-wrap:wrap;gap:10px}.imgs img{width:150px;height:110px;object-fit:cover;border-radius:8px}.sw{display:inline-block;width:40px;height:40px;border-radius:8px;margin:4px;border:1px solid #ded6ca}
.export-page{max-width:720px;margin:0 auto;background:var(--paper);padding-bottom:32px}
.export-page>.doc{padding:0 34px 32px}
@media(max-width:700px){.doc{padding:14px 18px 26px}.doc h1{font-size:23px}.doc .kv{grid-template-columns:84px 1fr;gap:7px 10px;font-size:13px}.doc table{font-size:12px}.export-page>.doc{padding:0 18px 26px}}
@media print{body{background:#fff}.export-page{max-width:none;padding:0}.cv-fit{height:1053px!important}.cv-sheet{transform:scale(.65)!important}.doc{padding:0}.doc h2{break-after:avoid}}
`;

function cvNo(p){
  const d=(p&&p.createdAt)?new Date(p.createdAt):new Date();
  const bad=isNaN(d.getTime());
  const y=bad?new Date().getFullYear():d.getFullYear();
  const m=bad?new Date().getMonth()+1:d.getMonth()+1;
  return 'NO. '+y+'-'+String(m).padStart(2,'0');
}
function cvDate(s){
  if(!s) return '待定';
  const m=String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m?m[1]+'.'+m[2].padStart(2,'0')+'.'+m[3].padStart(2,'0'):String(s);
}
function coverData(p){
  const c=(p&&p.concept)||{};
  return {no:cvNo(p),title:(p&&p.name)||'摄影策划案',theme:c.theme||'待定',model:c.model||'待定',date:cvDate(p&&p.shootDate),
    client:(p&&p.client)||'个人委托 · PERSONAL',studio:(p&&p.studio)||'瞬刻摄影工作室 · STUDIO',est:'EST. '+new Date().getFullYear()};
}
function fitCovers(){
  document.querySelectorAll('.cv-fit').forEach(fit=>{
    const sheet=fit.querySelector('.cv-sheet'); if(!sheet) return;
    const parent=fit.parentElement;
    const avail=fit.clientWidth||(parent?parent.clientWidth:0)||1080;
    const s=Math.min(avail/1080,1);
    sheet.style.transform='scale('+s+')';
    fit.style.height=Math.round(1620*s)+'px';
    fit.querySelectorAll('[data-cv-fit]').forEach(el=>{
      const base=parseInt(el.getAttribute('data-cv-fit'),10)||24;
      let fs=base; el.style.fontSize=fs+'px';
      while(fs>24&&el.scrollWidth>el.clientWidth+2){fs-=4;el.style.fontSize=fs+'px';}
    });
  });
}
function coverHtml(p){
  const d=coverData(p);
  const col=(cls,label,value)=>'<div class="cv-col '+cls+'"><div class="crule"></div><div class="clabel">'+esc(label)+'</div><div class="cvalue" data-cv-fit="38">'+esc(value)+'</div></div>';
  return '<div class="cv-fit"><div class="cv-sheet">'
    +'<div class="cv-diamond">'+CV_DIAMOND+'</div>'
    +'<div class="cv-rule head"></div><div class="cv-rule foot"></div>'
    +'<div class="cv-eyebrow l">PHOTOGRAPHY PROPOSAL</div><div class="cv-eyebrow r">'+esc(d.no)+'</div>'
    +'<div class="cv-title" data-cv-fit="130">'+esc(d.title)+'</div>'
    +'<div class="cv-subtitle" data-cv-fit="24">A PHOTOGRAPHIC PROPOSAL · FOR '+esc(d.client)+'</div>'
    +col('c1','拍摄主题 · THEME',d.theme)+col('c2','出镜模特 · MODEL',d.model)+col('c3','拍摄日期 · DATE',d.date)
    +'<div class="cv-vsep v1"></div><div class="cv-vsep v2"></div>'
    +'<div class="cv-foot l" data-cv-fit="26">'+esc(d.studio)+'</div><div class="cv-foot r" data-cv-fit="26">'+esc(d.est)+'</div>'
    +'</div></div>';
}

const STATUSES=['灵感期','策划中','待拍摄','后期中','已交付','已归档'];
const STATUS_TAG=['gray','blue','red','purple','green','ink'];
const CITIES=[['北京',39.90,116.40],['上海',31.23,121.47],['广州',23.13,113.26],['深圳',22.54,114.06],['南京',32.06,118.78],['杭州',30.27,120.16],['成都',30.57,104.07],['西安',34.34,108.94]];
/* 全量城市坐标（省会 + 直辖市 + 港澳 + 主要二线），按大区分组，供下拉选择；
   算法（sunTimes）本身支持任意经纬度，这里只是常用预设 */
const CITY_GROUPS=[
  ['华北',[['北京',39.90,116.40],['天津',39.13,117.20],['石家庄',38.04,114.51],['太原',37.87,112.55],['呼和浩特',40.84,111.75]]],
  ['东北',[['沈阳',41.80,123.43],['大连',38.91,121.61],['长春',43.88,125.32],['哈尔滨',45.80,126.53]]],
  ['华东',[['上海',31.23,121.47],['南京',32.06,118.78],['苏州',31.30,120.58],['无锡',31.49,120.31],['常州',31.78,119.95],['南通',31.98,120.89],['杭州',30.27,120.16],['宁波',29.87,121.54],['温州',28.00,120.67],['嘉兴',30.75,120.76],['绍兴',30.03,120.58],['合肥',31.82,117.23],['福州',26.07,119.30],['厦门',24.48,118.09],['泉州',24.87,118.68],['南昌',28.68,115.86],['济南',36.65,117.12],['青岛',36.07,120.38],['烟台',37.46,121.39],['威海',37.51,122.12]]],
  ['华中',[['郑州',34.75,113.63],['洛阳',34.62,112.45],['武汉',30.59,114.30],['长沙',28.23,112.94]]],
  ['华南',[['广州',23.13,113.26],['深圳',22.54,114.06],['珠海',22.27,113.58],['佛山',23.02,113.12],['东莞',23.02,113.75],['中山',22.52,113.39],['惠州',23.11,114.42],['南宁',22.82,108.32],['海口',20.04,110.35],['三亚',18.25,109.51],['香港',22.32,114.17],['澳门',22.20,113.55]]],
  ['西南',[['重庆',29.56,106.55],['成都',30.57,104.07],['贵阳',26.65,106.63],['昆明',24.88,102.83],['拉萨',29.65,91.14]]],
  ['西北',[['西安',34.34,108.94],['兰州',36.06,103.83],['西宁',36.62,101.78],['银川',38.47,106.27],['乌鲁木齐',43.83,87.62]]]
];
const CITY_ALL=[].concat.apply([],CITY_GROUPS.map(g=>g[1]));
/* 当前经纬度匹配到的城市（±0.15° 容差，兼容手输小数位差异）；无匹配 → null（视为自定义地点） */
function cityMatch(p,all){
  all=all||CITY_ALL;
  const la=parseFloat(p&&p.lat), ln=parseFloat(p&&p.lng);
  if(isNaN(la)||isNaN(ln)) return null;
  for(let i=0;i<all.length;i++){ if(Math.abs(all[i][1]-la)<=0.15&&Math.abs(all[i][2]-ln)<=0.15) return all[i]; }
  return null;
}
/* 城市下拉选择：城市 → 写入坐标；自定义地点 → 引导手输经纬度（不改动现有值） */
function pickCity(v){
  const p=cur();
  if(p&&p.demo){ toast('示例项目只读，请点「复制为我的项目」后再修改'); return; }   // 提前拦截，避免成功提示覆盖只读提示
  if(v==='__custom'){
    toast('已选「自定义地点」，请在右侧经纬度栏直接输入坐标');
    const el=document.getElementById('p_lat'); if(el&&!el.disabled) el.focus();
    return;
  }
  const c=CITY_ALL.find(x=>x[0]===v); if(!c) return;
  setLL(String(c[1]),String(c[2]));
  toast('已切换为 '+c[0]+'，日照按当地坐标计算');
}

/* IndexedDB：图片 + 项目主存储 + 姿势图库（indexedDB.open('shotflow',4)，即数据结构版本 4；
   项目主存储自该 schema 起存于 IndexedDB，不再写 localStorage）。
   A2 降级守卫：db 未就绪时（隐私模式 / 存储被禁 / open 失败）每个方法安全空转——
   读类返回 null/[]、写类静默 resolve，绝不向调用方抛同步异常；可用性判断统一走 idb.ready()。 */
function shiseiMetadata(key,rec){
  return {key,pid:rec.pid,cat:rec.cat,view:rec.view,zh:rec.zh,en:rec.en,ja:rec.ja,url:rec.url,syncedAt:rec.syncedAt,bytes:String(rec.data||'').length};
}
let shiseiSnapshotCache=null,shiseiSnapshotAt=0;
function invalidateShiseiSnapshot(){shiseiSnapshotCache=null;shiseiSnapshotAt=0;}
const idb={db:null,
  ready(){return !!idb.db;},
  open(){return new Promise((res,rej)=>{const r=indexedDB.open('shotflow',4);
    r.onupgradeneeded=e=>{const db=e.target.result;
      if(!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      if(!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if(!db.objectStoreNames.contains('shisei_meta')) db.createObjectStore('shisei_meta');
      if(!db.objectStoreNames.contains('shisei_images')) db.createObjectStore('shisei_images');
      if(!db.objectStoreNames.contains('shisei_index')){
        const idx=db.createObjectStore('shisei_index'),imgs=e.target.transaction.objectStore('shisei_images');
        const cursor=imgs.openCursor();
        cursor.onsuccess=()=>{
          const row=cursor.result;if(!row)return;
          const rec=row.value||{};
          if(typeof rec.data==='string'&&rec.data){idx.put(shiseiMetadata(row.key,rec),row.key);row.update(rec.data);}
          else row.delete();
          row.continue();
        };
      }
    };
    r.onblocked=()=>{toast('数据库升级等待旧页面关闭，请关闭其他 Stillmark 标签页后重试',8000);};
    r.onsuccess=e=>{
      idb.db=e.target.result;
      idb.db.onversionchange=()=>{idb.db.close();idb.db=null;markPersistConflict();toast('数据版本已更新，请先备份未保存的修改，再刷新页面',8000);};
      res();
    };r.onerror=()=>rej(r.error||new Error('IDB_OPEN'));});},
  async reopenProjects(){
    // Reopen a stale connection, never replace the original comparison baseline.
    if(idb.db){idb.db.close();idb.db=null;}
    await idb.open();
  },
  put(k,v){if(!idb.db) return Promise.resolve();return new Promise((res,rej)=>{const t=idb.db.transaction('images','readwrite');t.objectStore('images').put(v,k);t.oncomplete=res;t.onerror=rej;});},
  get(k){if(!idb.db) return Promise.resolve(null);return new Promise((res,rej)=>{const r=idb.db.transaction('images').objectStore('images').get(k);r.onsuccess=()=>res(r.result);r.onerror=rej;});},
  del(k){if(!idb.db) return Promise.resolve();return new Promise((res,rej)=>{const t=idb.db.transaction('images','readwrite');t.objectStore('images').delete(k);t.oncomplete=res;t.onerror=rej;});},
  keys(){if(!idb.db) return Promise.resolve([]);return new Promise((res,rej)=>{const r=idb.db.transaction('images').objectStore('images').getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=rej;});},
  getProjects(){if(!idb.db) return Promise.resolve(null);return new Promise((res,rej)=>{const r=idb.db.transaction('projects').objectStore('projects').get('all');r.onsuccess=()=>res(r.result);r.onerror=rej;});},
  /* 读比较与写入必须在同一个 readwrite 事务中：跨标签页串行，不能先在独立事务中检查。 */
  putProjects(a,expected){return idb.compareProjects(a,expected,false);},
  clearProjects(expected){return idb.compareProjects(null,expected,true);},
  mergeProjects(a,expected){
    if(!idb.db)return Promise.reject(new Error('IDB_UNAVAILABLE'));
    return new Promise((res,rej)=>{
      const tx=idb.db.transaction('projects','readwrite'),store=tx.objectStore('projects'),r=store.get('all');
      let merged=null, failure=null;
      r.onsuccess=()=>{
        try{
          const disk=r.result==null?null:r.result;
          // 全库清空不能被旧页面的保存复活。
          if(disk===null&&expected!=='null')return;
          merged=mergeProjectChanges(JSON.parse(expected),a,disk);
          if(merged!==null){
            // Keep read, comparison and put inside the same IDB callback.
            const write=store.put(merged,'all');
            write.onerror=()=>{failure=write.error;};
          }
        }catch(err){failure=err;try{tx.abort();}catch{}}
      };
      r.onerror=()=>{failure=r.error;};
      tx.oncomplete=()=>failure?rej(failure):res(merged);
      tx.onabort=()=>rej(failure||tx.error||new Error('IDB_ABORT'));
      tx.onerror=ev=>{failure=failure||ev.target.error||tx.error||new Error('IDB_WRITE');};
    });
  },
  importProjects(a,expected,images){return idb.compareProjects(a,expected,false,images);},
  compareProjects(a,expected,clear,images){
    if(!idb.db) return Promise.reject(new Error('IDB_UNAVAILABLE'));
    return new Promise((res,rej)=>{
      const t=idb.db.transaction(clear||images?['projects','images']:['projects'],'readwrite');
      const store=t.objectStore('projects'), r=store.get('all');
      let matched=false;
      r.onsuccess=()=>{
        if(!projectDataEqual(r.result==null?null:r.result,JSON.parse(expected))) return;
        matched=true;
        if(clear){ store.delete('all'); t.objectStore('images').clear(); }
        else {
          store.put(a,'all');
          // add 而非 put：新图片键碰撞时整个事务回滚，不覆盖现有图片。
          if(images){ const imgs=t.objectStore('images'); Object.keys(images).forEach(k=>imgs.add(images[k],k)); }
        }
      };
      t.oncomplete=()=>res(matched);
      t.onabort=()=>rej(t.error||new Error('IDB_ABORT'));
      t.onerror=()=>rej(t.error||new Error('IDB_WRITE'));
    });
  },
  /* 姿势图库：meta + 缩略图 */
  getShiseiMeta(k){if(!idb.db) return Promise.resolve(null);return new Promise((res,rej)=>{const r=idb.db.transaction('shisei_meta').objectStore('shisei_meta').get(k);r.onsuccess=()=>res(r.result);r.onerror=rej;});},
  putShiseiMeta(k,v){if(!idb.db) return Promise.resolve();return new Promise((res,rej)=>{const t=idb.db.transaction('shisei_meta','readwrite');t.objectStore('shisei_meta').put(v,k);t.oncomplete=res;t.onerror=()=>rej(t.error);});},
  putShiseiImg(k,v){
    if(!idb.db)return Promise.reject(new Error('IDB_UNAVAILABLE'));
    if(!v||typeof v.data!=='string'||!v.data)return Promise.reject(new Error('INVALID_GALLERY_IMAGE'));
    return new Promise((res,rej)=>{
      const t=idb.db.transaction(['shisei_images','shisei_index'],'readwrite');
      t.objectStore('shisei_images').put(v.data,k);
      t.objectStore('shisei_index').put(shiseiMetadata(k,v),k);
      t.oncomplete=()=>{invalidateShiseiSnapshot();delete imgCache[k];res();};
      t.onabort=t.onerror=()=>rej(t.error||new Error('IDB_WRITE'));
    });
  },
  getShiseiImg(k){if(!idb.db)return Promise.resolve(null);return new Promise((res,rej)=>{
    const r=idb.db.transaction('shisei_images').objectStore('shisei_images').get(k);
    r.onsuccess=()=>res(typeof r.result==='string'?{data:r.result}:null);r.onerror=rej;
  });},
  delShiseiImg(k){if(!idb.db)return Promise.resolve();return new Promise((res,rej)=>{
    const t=idb.db.transaction(['shisei_images','shisei_index'],'readwrite');
    t.objectStore('shisei_images').delete(k);t.objectStore('shisei_index').delete(k);
    t.oncomplete=()=>{invalidateShiseiSnapshot();delete imgCache[k];res();};t.onabort=t.onerror=()=>rej(t.error);
  });},
  shiseiImgKeys(){if(!idb.db)return Promise.resolve([]);return new Promise((res,rej)=>{const r=idb.db.transaction('shisei_index').objectStore('shisei_index').getAllKeys();r.onsuccess=()=>res(r.result);r.onerror=rej;});},
  shiseiSnapshot(){
    if(!idb.db)return Promise.resolve({rows:[],stats:{count:0,bytes:0,avg:0}});
    if(shiseiSnapshotCache&&Date.now()-shiseiSnapshotAt<30000)return shiseiSnapshotCache;
    shiseiSnapshotAt=Date.now();
    const pending=new Promise((res,rej)=>{
      const rows=[];let bytes=0;
      const r=idb.db.transaction('shisei_index').objectStore('shisei_index').openCursor();
      r.onsuccess=e=>{const cursor=e.target.result;
        if(!cursor){const count=rows.length;res({rows,stats:{count,bytes,avg:count?Math.round(bytes/count):0}});return;}
        const v=cursor.value||{};
        rows.push({key:cursor.key,pid:v.pid,cat:v.cat,view:v.view,zh:v.zh,en:v.en,ja:v.ja,url:v.url});
        bytes+=Number(v.bytes)||0;cursor.continue();
      };r.onerror=rej;
    });
    shiseiSnapshotCache=pending;
    pending.catch(()=>{if(shiseiSnapshotCache===pending)invalidateShiseiSnapshot();});
    return pending;
  },
  async shiseiIndex(){return (await idb.shiseiSnapshot()).rows;},
  async shiseiImgStats(){return (await idb.shiseiSnapshot()).stats;},
  clearShisei(){if(!idb.db) return Promise.resolve();return new Promise((res,rej)=>{const t=idb.db.transaction(['shisei_meta','shisei_images','shisei_index'],'readwrite');t.objectStore('shisei_meta').clear();t.objectStore('shisei_images').clear();t.objectStore('shisei_index').clear();t.oncomplete=()=>{invalidateShiseiSnapshot();res();};t.onerror=()=>rej(t.error);});}
};
const imgCache=Object.create(null);
const poseCacheAccess=new Map(),poseReads=new Map();
const POSE_CACHE_MAX=96,POSE_CACHE_CHARS=8*1024*1024,POSE_CACHE_TTL=5*60*1000;
function projectImageKeys(p){
  return new Set(p?[...(p.mood||[]).filter(x=>x.type==='image').map(x=>x.content),...(p.refs||[]).map(x=>x.key),...(p.shots||[]).flatMap(x=>x.refIds||[])].filter(Boolean):[]);
}
function activeImageKeys(){
  const keys=projectImageKeys(view.mode==='project'?cur():null);
  if(view.mode==='project'&&typeof selRefs!=='undefined')selRefs.forEach(k=>keys.add(k));
  return keys;
}
function trimImageCache(dropInactive=false,now=Date.now()){
  const keep=activeImageKeys(),rows=[],inactive=[];
  let size=0;
  for(const k of Object.keys(imgCache)){
    if(keep.has(k))continue;
    if(k.startsWith('shisei:')){
      const at=poseCacheAccess.get(k)||0;
      if(dropInactive||now-at>POSE_CACHE_TTL){delete imgCache[k];poseCacheAccess.delete(k);continue;}
      rows.push({k,at,n:imgCache[k].length});size+=imgCache[k].length;
    }else if(dropInactive&&idb.ready()&&!storageDegraded&&!persistConflict){
      // Only evict confirmed disk-backed data. Failed imports/temporary data are retained.
      inactive.push({key:k,value:imgCache[k]});
    }
  }
  // Image keys are immutable after creation; one key-only scan replaces N full image reads.
  if(inactive.length)idb.keys().then(keys=>{
    if(!idb.ready()||storageDegraded||persistConflict)return;
    const stored=new Set(keys),active=activeImageKeys();
    for(const {key,value} of inactive)if(stored.has(key)&&imgCache[key]===value&&!active.has(key))delete imgCache[key];
  }).catch(()=>{});
  rows.sort((a,b)=>a.at-b.at);
  let count=rows.length;
  for(const row of rows){
    if(count<=POSE_CACHE_MAX&&size<=POSE_CACHE_CHARS)break;
    delete imgCache[row.k];poseCacheAccess.delete(row.k);count--;size-=row.n;
  }
  for(const k of poseCacheAccess.keys())if(!imgCache[k])poseCacheAccess.delete(k);
}
async function cacheProjectImages(p){
  /* v10.4：上传图不再写 mood，预载必须覆盖参考图库与分镜引用，否则打开项目时分镜缩略图会全空 */
  const ids=[...projectImageKeys(p)].filter(k=>!String(k).startsWith('shisei:'));
  for(let i=0;i<ids.length;i+=8)await Promise.all(ids.slice(i,i+8).map(async id=>{
    if(imgCache[id])return;
    const v=await idb.get(id);if(v)imgCache[id]=v;
  }));
  trimImageCache(false);
}


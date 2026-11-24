/* E2E 关键路径测试：覆盖审核报告中纯函数测试无法触达的渲染层 / DOM 交互层。
   用法：npm run test:e2e（Playwright 自动启动 tests/e2e/static-server.mjs）
   覆盖：① 新建项目→加分镜→排程→导出文档 完整链路
        ② FB-1 渲染层回归：输入分镜名后触发重绘，输入内容不丢失
        ③ P0 持久化：页面隐藏时冲刷未落盘数据 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

/* 版本断言取 package.json 真源：写死版本号会在每次发版时误报
   （v10.7.2 的 CI 首跑就因为断言里写死 v10.7.0 而失败）。 */
const APP_VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

async function openFreshApp(page) {
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await expect(page.locator('.pcard').first()).toBeVisible();
}

async function createProject(page, name) {
  await page.getByRole('button', { name: '新建策划案' }).click();
  await expect(page.locator('#nameModal')).toHaveClass(/show/);
  await page.locator('#nameInput').fill(name);
  await page.locator('#nameInput').press('Enter');
  await expect(page.locator('#s_name')).toBeVisible(); // 进入项目后默认 shots 页签
}

/* 等防抖写入真正落到 IndexedDB，再刷新。否则刷新可能早于 saveP 落盘，
   测到的就不是「seed 是否覆盖已有项目」，而是「数据还没写进去」。
   v10.8.0 修法：原 waitForFunction(async...) 自建 IDB 连接，在 raf 轮询里与 saveP 的
   200ms 防抖 + 串行写链交错（曾稳定误报）；改为 expect.poll 的离散重试，读同一条 IDB
   记录并确认 name 与来源一致，最终一致性由重试保证。 */
async function waitProjectPersisted(page, name) {
  await expect.poll(async () => page.evaluate(async (target) => {
    const arr = await new Promise((res) => {
      const req = indexedDB.open('shotflow');
      req.onsuccess = () => {
        const db = req.result;
        const g = db.transaction('projects').objectStore('projects').get('all');
        g.onsuccess = () => { db.close(); res(g.result || []); };
        g.onerror = () => res([]);
      };
      req.onerror = () => res([]);
    });
    return Array.isArray(arr) && arr.some((p) => p && p.name === target) ? arr.length : -1;
  }, name), { timeout: 8000, message: '项目未落到 IndexedDB' }).not.toBe(-1);
}

test('核心路径：新建项目 → 加分镜 → 排程 → 导出提案文档', async ({ page }) => {
  await openFreshApp(page);
  await createProject(page, 'E2E 核心路径');

  // 添加分镜
  await page.locator('#s_name').fill('巷口逆光回眸');
  await page.getByRole('button', { name: '添加分镜' }).click();
  await expect(page.locator('#shotList .shot')).toHaveCount(1);
  await expect(page.locator('#shotList .shot').first()).toContainText('巷口逆光回眸');

  // 排程引擎：切到日程页，分镜应按「起–止」时间出现在时间轴
  await page.locator('.ptab', { hasText: '日程' }).click();
  await expect(page.locator('#tabBody')).toContainText('巷口逆光回眸');
  await expect(page.locator('#tabBody')).toContainText('集合');
  await expect(page.locator('#tabBody')).toContainText('收工');

  // 文档输出：提案弹窗出现，导出 HTML 按钮仅提案可见
  // 注意：客户提案按设计只含主题/情绪/拍摄安排/报价，不含逐条分镜清单（分镜在执行手册里）
  await page.getByRole('button', { name: '客户提案' }).click();
  await expect(page.locator('#docModal')).toHaveClass(/show/);
  await expect(page.locator('#docExportBtn')).toBeVisible();
  // openDoc 提案用「四、报价」标题（导出 HTML 文件才用「服务报价」），断言两者共有文案
  expect(await page.locator('#docBody').innerText()).toContain('报价');
  expect(await page.locator('#docBody').innerText()).toContain('E2E 核心路径');

  // 执行手册：含分镜头清单，且有刚才添加的分镜内容
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '执行手册' }).click();
  await expect(page.locator('#docBody')).toContainText('分镜头清单');
  await expect(page.locator('#docBody')).toContainText('巷口逆光回眸');
});

test('FB-1 渲染层回归：输入分镜名后触发重绘，草稿不丢失', async ({ page }) => {
  await openFreshApp(page);
  await createProject(page, 'E2E 表单草稿');

  // 输入名称与备注后，触发 setShiseiCat → renderShots 全量重绘（历史 FB-1 场景）
  await page.locator('#s_name').fill('不应丢失的分镜名');
  await page.locator('#s_note').fill('备注也不应丢失');
  const chips = page.locator('.ref-group-head .chips .chip');
  if (await chips.count() > 0) {
    await chips.first().click();
    await expect(page.locator('#s_name')).toHaveValue('不应丢失的分镜名');
    await expect(page.locator('#s_note')).toHaveValue('备注也不应丢失');
  } else {
    // 图库未同步时分类 chip 仍会渲染（cats 来自常量），此处兜底断言表单仍在
    await expect(page.locator('#s_name')).toHaveValue('不应丢失的分镜名');
  }

  // 联动草稿：选参考图来源切换（点分镜搜索框输入后再清空）也不应清掉名称
  await page.locator('#s_filter').fill('关键词');
  await page.locator('#s_filter').fill('');
  await expect(page.locator('#s_name')).toHaveValue('不应丢失的分镜名');
});

test('P2 安全加固：恶意颜色值在情绪板渲染时被 safeColor 回退，不产生 CSS 注入', async ({ page }) => {
  await openFreshApp(page);
  // 直接注入一个带恶意颜色 content 的项目到内存缓存，再进入其情绪板页验证渲染层防护
  await page.evaluate(() => {
    const p = {
      id: 'p2_inject_test', name: 'P2 注入测试', status: '策划中',
      mood: [{ id: 'm1', type: 'color', content: 'red;position:fixed;top:0;z-index:9999', tags: [], fav: false }],
      refs: [], shots: [], schedule: [], scenes: [], items: [], budget: [], notes: [], todos: [],
      dayInit: [], shootDates: [], tagVocab: [], v3: 1, createdAt: Date.now(), updatedAt: Date.now()
    };
    const arr = loadP(); arr.push(p); saveP(arr);
  });
  await page.evaluate(async () => { await openProject('p2_inject_test'); });
  await page.locator('.ptab', { hasText: '情绪板' }).click();
  await expect(page.locator('#moodGrid')).toBeVisible();
  // 色块 style 应为 safeColor 回退后的默认色，绝不含注入片段
  const style = await page.locator('.mood-item .mcolor').first().getAttribute('style');
  expect(style).toContain('#c8a97e');
  expect(style).not.toContain('position');
  expect(style).not.toContain('fixed');
  expect(style).not.toContain('9999');
});

test('P0 持久化：新建项目后刷新页面，数据仍在（IndexedDB 落盘）', async ({ page }) => {
  await openFreshApp(page);
  await createProject(page, 'E2E 持久化校验');
  await page.locator('#s_name').fill('持久化分镜');
  await page.getByRole('button', { name: '添加分镜' }).click();
  await expect(page.locator('#shotList .shot')).toHaveCount(1);

  // 等待防抖写入完成（saveP 200ms + 写入），再模拟页面隐藏触发 flush
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.evaluate(() => new Promise(r => setTimeout(r, 200)));

  // 刷新后重新进入项目，确认数据持久化未丢
  await page.reload();
  await expect(page.locator('.pcard', { hasText: 'E2E 持久化校验' })).toBeVisible();
  await page.locator('.pcard', { hasText: 'E2E 持久化校验' }).click();
  await expect(page.locator('#shotList .shot')).toHaveCount(1);
  await expect(page.locator('#shotList .shot').first()).toContainText('持久化分镜');
});

/* ===== v10.6.0 设置弹窗 ===== */

test('设置弹窗：打开 / 版本信息 / Esc 与关闭按钮 / 关闭后看板回归', async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  // 版本信息区：应用版本（构建注入）/ SW 缓存 / IndexedDB 数据结构 / 模块版本表
  await expect(page.locator('#settingsBody .settings-ver')).toHaveText('v' + APP_VERSION);
  /* SW 缓存版本取运行期真源（MODULE_VERSIONS.swCache），写死版本会在每次 bump 时误报 */
  const swCache=await page.evaluate(()=>MODULE_VERSIONS.swCache);
  await expect(page.locator('#settingsBody')).toContainText(swCache);
  await expect(page.locator('#settingsBody')).toContainText('数据结构（IndexedDB）');
  await expect(page.locator('#settingsBody')).toContainText('各代码模块最后实质变更');
  await expect(page.locator('#settingsBody')).toContainText('01-data.js');
  // Esc 关闭（挂在现有 Esc 链：confirm/name 之后）
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).not.toHaveClass(/show/);
  // 再开 → 关闭按钮关闭；看板头部与搜索不回归
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await page.locator('#settingsModal').getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('#settingsModal')).not.toHaveClass(/show/);
  await page.locator('#boardSearch').fill('E2E');
  await expect(page.locator('#boardSearch')).toHaveValue('E2E');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  // 遮罩点击关闭（设计 §7.2-7）：点左上角空白处（此处为遮罩本身，弹窗居中不会覆盖）
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await page.locator('#settingsModal').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('#settingsModal')).not.toHaveClass(/show/);
});

test('设置弹窗：姿势图库同步开关切换写 localStorage', async ({ page }) => {
  await openFreshApp(page);
  // 图库同步走公开 CDN，测试环境无需真实网络
  await page.route('**/cdn.jsdelivr.net/**', (r) => r.abort());
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  await expect(page.locator('#settingsShiseiBox')).toContainText('姿势图库同步');
  // 暂停：写 localStorage['wb_sf_shisei_sync']='0'
  await page.locator('#settingsShiseiBox').getByRole('button', { name: '暂停' }).click();
  await expect(page.locator('#settingsShiseiBox').getByRole('button', { name: '恢复' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('wb_sf_shisei_sync'))).toBe('0');
  // 恢复：移除该键并触发立即同步
  await page.locator('#settingsShiseiBox').getByRole('button', { name: '恢复' }).click();
  expect(await page.evaluate(() => localStorage.getItem('wb_sf_shisei_sync'))).toBeNull();
});

test('设置弹窗：反馈走 Web3Forms 页面内提交（成功 + 失败降级）', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.__feedbackPosts = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (url, options) => {
      if(String(url)!=='https://api.web3forms.com/submit') return originalFetch(url, options);
      window.__feedbackPosts.push({method:options.method,json:JSON.parse(options.body)});
      const success=window.__feedbackPosts.length===1;
      return new Response(JSON.stringify({success}),{status:success?200:500,headers:{'Content-Type':'application/json'}});
    };
  });
  const posts = () => page.evaluate(() => window.__feedbackPosts);
  // 各浏览器的 clipboard 权限名不一致；只模拟本测试关注的写入契约。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__feedbackClipboard = value; } }
    });
  });
  await openFreshApp(page);
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  // 环境信息预览在折叠 details 内：先展开再断言内容（构建注入的版本号）
  await page.locator('#settingsBody summary', { hasText: '环境信息' }).click();
  await expect(page.locator('#fbEnvPreview')).toContainText('版本：v' + APP_VERSION);
  // 空标题提交被拦截（不发请求）
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('请先填写反馈标题');
  expect((await posts()).length).toBe(0);
  // 成功路径：POST 负载语义 + 成功提示 + 页面不跳转 + 表单清空
  await page.locator('#fbTitle').fill('测试反馈标题');
  await page.locator('#fbBody').fill('描述内容');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('反馈已提交，感谢！');
  expect((await posts()).length).toBe(1);
  const first = (await posts())[0];
  expect(first.method).toBe('POST');
  expect(first.json.access_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(first.json.subject).toBe('[Bug] 测试反馈标题');
  expect(first.json.from_name).toBe('瞬刻摄影工作台');
  expect(first.json.message).toContain('描述内容');
  expect(first.json.message).toContain('---');
  expect(first.json.message).toContain('版本：v' + APP_VERSION);
  expect(page.url()).toContain('shotflow.html');
  expect(await page.inputValue('#fbTitle')).toBe('');
  // 失败路径：500 → 降级提示，不抛异常、不跳转
  await page.locator('#fbTitle').fill('失败反馈');
  await page.locator('#fbBody').fill('内容');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('提交失败，请使用「复制反馈内容」');
  expect((await posts()).length).toBe(2);
  // 复制兜底 + 隐私文案（提到 Web3Forms，且不再出现 GitHub / 旧邮件方案字样）
  await expect(page.getByRole('button', { name: '复制反馈内容' })).toBeVisible();
  await page.getByRole('button', { name: '复制反馈内容' }).click();
  await expect(page.locator('.toast')).toContainText('已复制反馈内容');
  expect(await page.evaluate(() => window.__feedbackClipboard)).toContain('失败反馈');
  const fbText = await page.locator('#fbCard').innerText();
  expect(fbText).toContain('Web3Forms');
  expect(fbText).not.toContain('GitHub');
  expect(fbText).not.toContain('邮件应用');
  expect(errors.length).toBe(0);
});

test('设置页「关于与部署」弹窗 + 全局 footer（Esc 先关弹窗再关设置）', async ({ page }) => {
  await openFreshApp(page);
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  const card = page.locator('#deployCard');
  await expect(card).toBeVisible();
  await expect(card).toContainText('关于与部署');
  await expect(card).toContainText('MIT License © 2026 Stillmark-服雲');
  await page.getByRole('button', { name: '为自己部署' }).click();
  const modal = page.locator('#deployModal');
  await expect(modal).toHaveClass(/show/);
  // 五项内容：部署说明 / 开源地址 / 版权 / 用途 / 三句话
  await expect(modal).toContainText('纯静态单文件应用');
  await expect(modal).toContainText('GitHub Pages / Cloudflare Pages / Vercel / 自有服务器');
  await expect(modal).toContainText('MIT License © 2026 Stillmark-服雲');
  await expect(modal).toContainText('项目数据保存在本地浏览器（IndexedDB）');
  await expect(modal).toContainText('离线用');
  await expect(modal.locator('.deploy-points li')).toHaveCount(3);
  const link = modal.locator('a[href]').first();
  await expect(link).toHaveAttribute('href', 'https://github.com/NopantsNobra/shotflow-planner');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  // Esc 第一次只关部署弹窗，设置页保留
  await page.keyboard.press('Escape');
  await expect(modal).not.toHaveClass(/show/);
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  // Esc 第二次关闭设置页
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsModal')).not.toHaveClass(/show/);
  // 全局 footer：在 #app 之外、可见、含版权行与开源链接
  const foot = page.locator('.app-foot');
  await expect(foot).toBeVisible();
  await expect(foot).toContainText('Powered by Stillmark');
  await expect(foot).toContainText('瞬刻摄影工作台');
  await expect(foot).toContainText('MIT License');
  await expect(foot.locator('a[href="https://github.com/NopantsNobra/shotflow-planner"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.getElementById('app').nextElementSibling?.className || '')).toContain(
    'app-foot'
  );
  // 390px 窄屏不溢出；项目页内重绘后 footer 仍在
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
  await page.locator('.pcard').first().click();
  await expect(page.locator('#s_name')).toBeVisible();
  await expect(foot).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll('.app-foot').length)).toBe(1);
});

test('安全回归：恶意备份 JSON 导入被净化，不执行脚本（A1 id/status 注入面）', async ({ page }) => {
  await openFreshApp(page);
  const evil = {
    app: 'stillmark', version: 4, type: 'project',
    project: {
      id: "x');window.__pwned=1;//", name: '恶意导入项目', client: '', studio: '',
      status: '策划中</span><img src=x onerror=window.__pwned=1>',
      shootDate: '', location: '', lat: '', lng: '',
      createdAt: Date.now(), updatedAt: Date.now(),
      concept: {}, mood: [], refs: [],
      scenes: [{ id: "s');window.__pwned=1;//", name: '注入场景', note: '', done: false }],
      shots: [{ id: "sh');window.__pwned=1;//", name: '注入分镜', date: '', duration: 10,
        sceneId: "s');window.__pwned=1;//", refIds: [], position: '', light: '', note: '', done: false, ord: 0 }],
      schedule: [], items: [], budget: [], notes: [], todos: [], tagVocab: [], shootDates: [], dayInit: []
    },
    images: {}
  };
  await page.locator('#importFile').setInputFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(evil)) });
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await page.locator('#confirmOk').click();
  // 单项目导入追加为新策划案：卡片可见、点击卡片不触发注入（旧实现此处会执行 ")
  await expect(page.locator('.pcard', { hasText: '恶意导入项目' })).toBeVisible();
  await page.locator('.pcard', { hasText: '恶意导入项目' }).click();
  await expect(page.locator('#shotList .shot')).toHaveCount(1);
  await expect(page.locator('#shotList .shot').first()).toContainText('注入分镜');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('数据安全回归：seed 标志缺失不会覆盖已有项目（A3）', async ({ page }) => {
  await openFreshApp(page);
  await createProject(page, '不能被覆盖的项目');
  await waitProjectPersisted(page, '不能被覆盖的项目'); // 先确保落盘，否则刷新早于写入
  await page.evaluate(() => localStorage.removeItem('wb_sf_seeded'));
  await page.reload();
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await expect(page.locator('.pcard', { hasText: '不能被覆盖的项目' })).toBeVisible();
});

test('稳定性回归：IndexedDB 不可用时优雅降级不白屏（A2）', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get: () => ({ open() { throw new Error('IDB blocked by test'); } })
    });
  });
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await expect(page.locator('#app')).toContainText('存储不可用');
  // 降级模式下示例仍可渲染、应用可用
  await expect(page.locator('.pcard').first()).toBeVisible();
});

/* ===================== v10.8.0 三项交互增强 ===================== */
/* 数据准备：直接写入一个受控项目（1 条带 slot 的分镜 + 1 条收藏分镜 + 1 条收藏待办），
   避免依赖示例项目的随机内容与只读限制；writeProjects 经 openProject .reload 后由应用加载。 */
async function setupV108Project(page){
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await page.evaluate(async () => {
    const pid='v108-test', date='2026-11-24';
    const p={id:pid,v3:1,name:'V108 测试案',client:'',studio:'',status:'策划中',shootDate:date,
      location:'',lat:'',lng:'',createdAt:Date.now(),updatedAt:Date.now(),demo:false,
      concept:{},mood:[],shots:[
        {id:'shot-a',name:'原始分镜',date:date,duration:20,slot:'10:00',sceneId:'',position:'平视',light:'',refIds:[],note:'原备注',done:false,ord:0,fav:false}],
      schedule:[],scenes:[],items:[],budget:[],notes:[],
      todos:[{id:'todo-a',title:'收藏的待办',owner:'',due:'',done:false,fav:true}],
      tagVocab:[],shootDates:[date],dayInit:[date]};
    await new Promise((res,rej)=>{
      const r=indexedDB.open('shotflow');
      r.onsuccess=()=>{const d=r.result,tx=d.transaction('projects','readwrite');tx.objectStore('projects').put([p],'all');tx.oncomplete=()=>{d.close();res();};tx.onerror=()=>rej(tx.error);};
      r.onerror=()=>rej(r.error);
    });
    localStorage.setItem('wb_sf_seeded','1'); localStorage.setItem('wb_sf_demo_v9','1');
  });
  await page.reload();
  await expect(page.locator('.pcard', { hasText:'V108 测试案' })).toBeVisible();
  await page.locator('.pcard', { hasText:'V108 测试案' }).click();
  await expect(page.locator('#s_name')).toBeVisible();
}
const shotData=async(page)=>page.evaluate(async()=>{
  const arr=await new Promise(res=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,g=d.transaction('projects').objectStore('projects').get('all');g.onsuccess=()=>{d.close();res(g.result||[])};g.onerror=()=>res([])};r.onerror=()=>res([])});
  const p=arr.find(x=>x.id==='v108-test'); return p?p.shots:[];
});

test('v10.8.0 复制分镜：完整复制、时间 +10、列表即时更新', async ({ page }) => {
  await setupV108Project(page);
  await expect(page.locator('.shot')).toHaveCount(1);
  const copyBtn=page.locator('.shot [title^="复制分镜"]');
  await expect(copyBtn).toHaveCount(1);
  await copyBtn.click();
  await expect(page.locator('.shot')).toHaveCount(2);
  await expect.poll(async()=> (await shotData(page)).length, {timeout:5000}).toBe(2); // 等 200ms 防抖落盘
  const shots=await shotData(page);
  expect(shots).toHaveLength(2);
  const clone=shots.find(s=>s.id!=='shot-a');
  expect(clone).toBeTruthy();
  expect(clone.name).toBe('原始分镜');
  expect(clone.note).toBe('原备注');
  expect(clone.slot).toBe('10:10');           // 10:00 + 10 分钟
  expect(clone.done).toBe(false);
  expect(clone.fav).toBe(false);
  const orig=shots.find(s=>s.id==='shot-a');
  expect(orig.slot).toBe('10:00');            // 原件不变
  await expect(page.locator('.shot').filter({hasText:'原始分镜'})).toHaveCount(2);
});

test('v10.8.0 收藏浮窗：只列当前页相关类型、concept 页无按钮', async ({ page }) => {
  await setupV108Project(page);
  // 分镜页：有打开收藏按钮，浮窗只列 shots 类型（本案无收藏分镜，但待办收藏属于 notes 不应出现）
  await expect(page.locator('#openFavBtn')).toBeVisible();
  await page.locator('#openFavBtn').click();
  await expect(page.locator('#favPickerModal')).toHaveClass(/show/);
  const body=await page.locator('#favPickerBody').innerText();
  expect(body).toContain('收藏');
  expect(body).not.toContain('收藏的待办');   // todos 不属于 shots 页签
  // concept 页无收藏 → 无按钮
  await page.keyboard.press('Escape');
  await expect(page.locator('#favPickerModal')).not.toHaveClass(/show/);
  await page.locator('.ptab', { hasText:'概念' }).click();
  await expect(page.locator('#openFavBtn')).toHaveCount(0);
});

test('v10.8.0 引用收藏：跨来源引用、时间 +10、可连续引用', async ({ page }) => {
  await setupV108Project(page);
  // 先给本案分镜加收藏（通过 UI 点 ☆），随后到 notes 页引用 todos 收藏
  await page.locator('.shot [title="收藏/取消收藏"]').first().click();
  await expect(page.locator('.shot [title="收藏/取消收藏"]').first()).toContainText('★');
  await page.locator('.ptab', { hasText:'协作' }).click();
  await expect(page.locator('#openFavBtn')).toBeVisible();
  await page.locator('#openFavBtn').click();
  await expect(page.locator('#favPickerModal')).toHaveClass(/show/);
  // notes 页签映射 notes+todos → 应看到「收藏的待办」，且不该看到分镜收藏
  await expect(page.locator('#favPickerBody')).toContainText('收藏的待办');
  await expect(page.locator('#favPickerBody')).not.toContainText('原始分镜');
  await page.locator('#favPickerBody button', { hasText:'引用收藏' }).click();
  await expect(page.locator('#favPickerModal')).toHaveClass(/show/);  // 浮窗保持打开可连续引用
  await expect.poll(async()=>page.evaluate(async()=>{
    const arr=await new Promise(res=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,g=d.transaction('projects').objectStore('projects').get('all');g.onsuccess=()=>{d.close();res(g.result||[])};g.onerror=()=>res([])};r.onerror=()=>res([])});
    const p=arr.find(x=>x.id==='v108-test'); return p?p.todos.length:0;
  }), {timeout:5000}).toBe(2);
  const todos=await page.evaluate(async()=>{
    const arr=await new Promise(res=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,g=d.transaction('projects').objectStore('projects').get('all');g.onsuccess=()=>{d.close();res(g.result||[])};g.onerror=()=>res([])};r.onerror=()=>res([])});
    const p=arr.find(x=>x.id==='v108-test'); return p?p.todos:[];
  });
  expect(todos).toHaveLength(2);
  const added=todos.find(t=>t.id!=='todo-a');
  expect(added.title).toBe('收藏的待办');
  expect(added.fav).toBe(false);
  expect(added.id).not.toBe('todo-a');
});

test('v10.8.0 全局 Esc：浮窗优先关闭，其后返回看板，看板无操作', async ({ page }) => {
  await setupV108Project(page);
  await page.locator('#openFavBtn').click();
  await expect(page.locator('#favPickerModal')).toHaveClass(/show/);
  await page.keyboard.press('Escape');
  // 第一次 Esc 只关浮窗，仍在项目页
  await expect(page.locator('#favPickerModal')).not.toHaveClass(/show/);
  await expect(page.locator('#s_name')).toBeVisible();
  // 第二次 Esc 返回看板
  await page.keyboard.press('Escape');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await expect(page.locator('.pcard').first()).toBeVisible();
  // 看板页再按 Esc 无副作用
  await page.keyboard.press('Escape');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
});

test('v10.8.0 引用时间顺延：带时分字段的收藏条目 +10 分钟', async ({ page }) => {
  // 注入一条带 slot 的收藏分镜到源项目，另一空项目作引用目标
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await page.evaluate(async () => {
    const date='2026-11-24';
    const src={id:'v108-src',v3:1,name:'源案',client:'',studio:'',status:'策划中',shootDate:date,
      location:'',lat:'',lng:'',createdAt:Date.now(),updatedAt:Date.now(),demo:false,
      concept:{},mood:[],shots:[{id:'fav-shot',name:'被收藏分镜',date:date,duration:20,slot:'14:55',sceneId:'',position:'',light:'',refIds:[],note:'',done:false,ord:0,fav:true}],
      schedule:[],scenes:[],items:[],budget:[],notes:[],todos:[],tagVocab:[],shootDates:[date],dayInit:[date]};
    const dst={id:'v108-dst',v3:1,name:'目标案',client:'',studio:'',status:'策划中',shootDate:date,
      location:'',lat:'',lng:'',createdAt:Date.now(),updatedAt:Date.now(),demo:false,
      concept:{},mood:[],shots:[],schedule:[],scenes:[],items:[],budget:[],notes:[],todos:[],tagVocab:[],shootDates:[date],dayInit:[date]};
    await new Promise((res,rej)=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,tx=d.transaction('projects','readwrite');tx.objectStore('projects').put([src,dst],'all');tx.oncomplete=()=>{d.close();res();};tx.onerror=()=>rej(tx.error);};r.onerror=()=>rej(r.error);});
    localStorage.setItem('wb_sf_seeded','1'); localStorage.setItem('wb_sf_demo_v9','1');
  });
  await page.reload();
  await page.locator('.pcard', { hasText:'目标案' }).click();
  await expect(page.locator('#s_name')).toBeVisible();
  await page.locator('#openFavBtn').click();
  await expect(page.locator('#favPickerBody')).toContainText('被收藏分镜');
  await page.locator('#favPickerBody button', { hasText:'引用收藏' }).click();
  await expect.poll(async()=>page.evaluate(async()=>{
    const arr=await new Promise(res=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,g=d.transaction('projects').objectStore('projects').get('all');g.onsuccess=()=>{d.close();res(g.result||[])};g.onerror=()=>res([])};r.onerror=()=>res([])});
    const p=arr.find(x=>x.id==='v108-dst'); return p?p.shots.length:0;
  }), {timeout:5000}).toBe(1);
  const shots=await page.evaluate(async()=>{
    const arr=await new Promise(res=>{const r=indexedDB.open('shotflow');r.onsuccess=()=>{const d=r.result,g=d.transaction('projects').objectStore('projects').get('all');g.onsuccess=()=>{d.close();res(g.result||[])};g.onerror=()=>res([])};r.onerror=()=>res([])});
    const p=arr.find(x=>x.id==='v108-dst'); return p?p.shots:[];
  });
  expect(shots).toHaveLength(1);
  expect(shots[0].slot).toBe('15:05');        // 14:55 + 10 分钟，跨小时进位
  expect(shots[0].name).toBe('被收藏分镜');
  expect(shots[0].fav).toBe(false);
});

/* ===================== v10.8.1 时长/按钮位置/延迟重排 ===================== */
test('v10.8.1 打开收藏按钮位于添加分镜/添加环节按钮旁', async ({ page }) => {
  await setupV108Project(page);
  // 分镜页：#openFavBtn 与「添加分镜」同处一个 .row，且紧邻其前
  const shotCtx=await page.evaluate(()=>{
    const btn=document.getElementById('openFavBtn');
    if(!btn) return null;
    const add=[...btn.parentElement.querySelectorAll('button')].find(b=>b.textContent.trim()==='添加分镜');
    const sib=[...btn.parentElement.querySelectorAll('button')];
    return {sameRow:!!add&&btn.parentElement===add.parentElement, nextIsAdd:!!add&&sib.indexOf(btn)+1===sib.indexOf(add),
      cls:btn.className, addCls:add?add.className:''};
  });
  expect(shotCtx).toBeTruthy();
  expect(shotCtx.sameRow).toBe(true);
  expect(shotCtx.nextIsAdd).toBe(true);
  expect(shotCtx.cls).toContain('btn-ghost');
  expect(shotCtx.cls).toContain('btn-sm');
  expect(shotCtx.addCls).toContain('btn-primary');
  // 日程页：同样紧邻「添加环节」之前，样式一致
  await page.locator('.ptab', { hasText:'日程' }).click();
  const schedCtx=await page.evaluate(()=>{
    const btn=document.getElementById('openFavBtn');
    if(!btn) return null;
    const all=[...btn.parentElement.querySelectorAll('button')];
    const add=all.find(b=>b.textContent.trim()==='添加环节');
    return {sameRow:!!add, nextIsAdd:!!add&&all.indexOf(btn)+1===all.indexOf(add), cls:btn.className};
  });
  expect(schedCtx).toBeTruthy();
  expect(schedCtx.sameRow).toBe(true);
  expect(schedCtx.nextIsAdd).toBe(true);
  expect(schedCtx.cls).toContain('btn-ghost');
});

test('v10.8.1 复制后不立即重排、点重新排程后一次性整体重排', async ({ page }) => {
  await setupV108Project(page);
  // 原分镜 10:00 / 20 分钟；复制后新分镜 slot=10:10（字面 +10），不应被 chain 覆盖成 10:20
  await page.locator('.shot [title^="复制分镜"]').click();
  await expect.poll(async()=> (await shotData(page)).length,{timeout:5000}).toBe(2);
  let shots=await shotData(page);
  const clone=shots.find(s=>s.id!=='shot-a');
  expect(clone.slot).toBe('10:10');
  // 重新排程按钮存在
  await expect(page.locator('#reschedAllBtn')).toBeVisible();
  await page.locator('#reschedAllBtn').click();
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await page.locator('#confirmOk').click();
  // 整体重排后：两条按 ord 链派生，第一条 10:00，第二条 10:20（原时长 20 分钟）
  await expect.poll(async()=>{
    const s=await shotData(page);
    const c=s.find(x=>x.id!=='shot-a');
    return c?c.slot:'';
  },{timeout:5000}).toBe('10:20');
  shots=await shotData(page);
  expect(shots.find(s=>s.id==='shot-a').slot).toBe('10:00');
  await expect(page.locator('.shot')).toHaveCount(2);
});

test('v10.8.2 所有可收藏页签主操作行均有打开收藏按钮，概念页无', async ({ page }) => {
  await setupV108Project(page);
  // 每个页签：按钮存在、与主操作按钮同 .row、样式一致、subbar 内不再有
  const tabs=[['情绪板','上传精选图','#m_text'],['分镜','添加分镜','#s_name'],['日程','添加环节','#n_title'],
    ['清单','添加','#f_scenes'],['预算','添加','#b_item'],['协作','添加','#td_title']];
  for(const [tab,addText,marker] of tabs){
    await page.locator('.ptab',{hasText:tab}).first().click();
    /* 等该页签特有元素出现，再读按钮——renderShots 异步，不能只等按钮（旧页签也有同名按钮） */
    await expect(page.locator(marker)).toBeVisible();
    const ctx=await page.evaluate((addText)=>{
      const btn=document.getElementById('openFavBtn');
      if(!btn) return {found:false};
      const rowBtn=[...btn.parentElement.querySelectorAll('button')].find(b=>b.textContent.trim()===addText);
      const inSubbar=!!document.querySelector('.subbar #openFavBtn');
      return {found:true, sameRow:!!rowBtn, inSubbar, cls:btn.className,
        rowCls:btn.parentElement.className};
    },addText);
    expect(ctx.found,{message:tab+' 页应有打开收藏按钮'}).toBe(true);
    expect(ctx.sameRow,{message:tab+' 页按钮应在主操作行'}).toBe(true);
    expect(ctx.inSubbar,{message:tab+' 页按钮不应在 subbar'}).toBe(false);
    expect(ctx.cls).toContain('btn-ghost');
    expect(ctx.cls).toContain('btn-sm');
    expect(ctx.rowCls).toContain('row');
  }
  // 概念页无收藏条目 → 无按钮
  await page.locator('.ptab',{hasText:'概念'}).first().click();
  await expect(page.locator('#openFavBtn')).toHaveCount(0);
});

/* P0：两个同源标签页共享 IDB，过期基线不允许覆盖先保存的数据。 */
test('P0 多标签页：不同项目合并，同项目冲突保留草稿',async({page,context})=>{
  await openFreshApp(page);
  await createProject(page,'并发基线');
  await waitProjectPersisted(page,'并发基线');
  const second=await context.newPage();
  await openFreshApp(second);
  await page.keyboard.press('Escape');
  await createProject(page,'第一标签页项目');
  await waitProjectPersisted(page,'第一标签页项目');
  await createProject(second,'第二标签页项目');
  await waitProjectPersisted(second,'第二标签页项目');
  expect(await second.evaluate(async()=> (await idb.getProjects()).map(p=>p.name))).toContain('第一标签页项目');
  await page.reload();await second.reload();
  for(const pg of [page,second]){
    await pg.locator('.pcard',{hasText:'并发基线'}).click();
    await expect(pg.locator('#s_name')).toBeVisible();
  }
  await page.evaluate(()=>{updateCur(p=>p.client='先保存');});
  await expect.poll(()=>page.evaluate(async()=> (await idb.getProjects()).find(p=>p.name==='并发基线').client)).toBe('先保存');
  await second.evaluate(()=>{updateCur(p=>p.client='本页草稿');});
  await expect(second.locator('#persistConflictTip')).toBeVisible();
  expect(await second.evaluate(()=>cur().client)).toBe('本页草稿');
  expect(await second.evaluate(async()=> (await idb.getProjects()).find(p=>p.name==='并发基线').client)).toBe('先保存');
  await second.close();
});

test('P0 备份导入：缺失图片拒绝，合法图片独立重映射',async({page})=>{
  await openFreshApp(page);
  await createProject(page,'导入前项目');
  await waitProjectPersisted(page,'导入前项目');
  await page.keyboard.press('Escape');
  const pack={app:'stillmark',version:4,type:'project',project:{name:'素材迁移',refs:[{key:'same',name:'样片'}],shots:[{name:'分镜',refIds:['same']}]},images:{}};
  const importPack=async()=>{
    await page.locator('#importFile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await page.locator('#confirmOk').click();
  };
  await importPack();
  await expect(page.locator('.toast')).toContainText('图片依赖缺失');
  await expect(page.locator('.pcard',{hasText:'导入前项目'})).toBeVisible();
  pack.images.same='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7sAAAAASUVORK5CYII=';
  await importPack();
  await expect(page.locator('.pcard',{hasText:'素材迁移'})).toBeVisible();
  const state=await page.evaluate(async()=>{
    const p=(await idb.getProjects()).find(p=>p.name.includes('素材迁移'));
    const key=p.refs[0].key;return {key,ref:p.shots[0].refIds[0],image:await idb.get(key)};
  });
  expect(state.key).not.toBe('same');expect(state.ref).toBe(state.key);expect(state.image).toBe(pack.images.same);
});

test('策划模式切换只隐藏模块，不删除预算或分镜',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(()=>{updateCur(p=>p.budget.push({id:'mode-budget',item:'保留的预算',amount:88}));});
  await page.locator('#workspaceMode').selectOption('casual');
  await expect(page.locator('.ptab',{hasText:'预算'})).toHaveCount(0);
  await expect(page.locator('.ptab',{hasText:'分镜'})).toBeVisible();
  await page.locator('#workspaceMode').selectOption('professional');
  await page.locator('.ptab',{hasText:'预算'}).click();
  await expect(page.locator('#tabBody')).toContainText('保留的预算');
});

test('批量修改分镜时长并保留原名称',async({page})=>{
  await setupV108Project(page);
  await page.getByRole('button',{name:'批量编辑'}).click();
  await page.locator('.batch-check').check();
  await page.locator('#batchDuration').selectOption('30');
  await page.getByRole('button',{name:'应用',exact:true}).click();
  await expect.poll(async()=> (await shotData(page))[0].duration).toBe(30);
  await expect(page.locator('.shot').first()).toContainText('原始分镜');
});


test('素材包追加导入、依赖重映射、引用到项目且不进入看板',async({page})=>{
  await openFreshApp(page);
  await createProject(page,'素材接续项目');
  await waitProjectPersisted(page,'素材接续项目');
  await page.keyboard.press('Escape');
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV7sAAAAASUVORK5CYII=';
  const pack={app:'stillmark',version:4,type:'assets',assetVersion:1,assets:[{
    name:'迁移收藏组',shots:[{id:'s',name:'迁移分镜',fav:true,sceneId:'c',refIds:['old']}],
    scenes:[{id:'c',name:'迁移场景'}],refs:[{id:'r',key:'old',name:'样片'}]
  }],images:{old:image}};
  await page.locator('#importFile').setInputFiles({name:'assets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await page.locator('#confirmOk').click();
  await expect(page.locator('.masthead h1')).toContainText('已收藏');
  await expect(page.locator('#app')).toContainText('迁移分镜');
  const data=await page.evaluate(async()=>{
    const ps=await idb.getProjects(),p=ps.find(x=>x.assetPack&&x.name==='迁移收藏组');
    const s=p.shots[0],r=p.refs[0];return {key:r.key,ref:s.refIds[0],scene:s.sceneId,actual:p.scenes[0].id,image:await idb.get(r.key)};
  });
  expect(data.key).not.toBe('old');expect(data.ref).toBe(data.key);expect(data.scene).toBe(data.actual);expect(data.image).toBe(image);
  await page.getByRole('button',{name:'返回看板'}).click();
  await expect(page.locator('.pcard',{hasText:'迁移收藏组'})).toHaveCount(0);
  await page.locator('.pcard',{hasText:'素材接续项目'}).click();
  await expect(page.locator('#s_name')).toBeVisible();
  await page.locator('#openFavBtn').click();
  await expect(page.locator('#favPickerModal')).toContainText('迁移分镜');
  await page.evaluate(()=>{const p=loadP().find(x=>x.assetPack&&x.name==='迁移收藏组');referenceFav('shots',p.id,p.shots[0].id);});
  await expect.poll(async()=>page.evaluate(()=>{const p=cur(),s=p.shots.find(x=>x.name==='迁移分镜');return !!(s&&p.scenes.some(c=>c.id===s.sceneId)&&p.refs.some(r=>r.key===s.refIds[0]));})).toBe(true);
});

test('图库索引复用并在图片写入删除后失效',async({page})=>{
  await openFreshApp(page);
  const result=await page.evaluate(async()=>{
    localStorage.setItem('wb_sf_shisei_sync','0');
    const a=await idb.shiseiSnapshot(),b=await idb.shiseiSnapshot();
    await idb.putShiseiImg('shisei:e2e-cache',{cat:'测试',data:'data:image/png;base64,AAAA'});
    const c=await idb.shiseiSnapshot();
    await idb.delShiseiImg('shisei:e2e-cache');
    const d=await idb.shiseiSnapshot();
    return a===b&&c.rows.some(r=>r.key==='shisei:e2e-cache')&&!d.rows.some(r=>r.key==='shisei:e2e-cache');
  });
  expect(result).toBe(true);
});

test('分镜键盘排序、删除撤销、拍摄日补拍',async({page})=>{
  await setupV108Project(page);
  await page.locator('.shot [title^="复制分镜"]').click();
  await expect(page.locator('.shot')).toHaveCount(2);
  const secondId=await page.locator('.shot').nth(1).getAttribute('data-id');
  await page.locator('.shot').nth(1).getByRole('button',{name:'上移分镜'}).click();
  await expect(page.locator('.shot').first()).toHaveAttribute('data-id',secondId);
  await page.locator('.shot').first().locator('[title="删除分镜"]').click();
  await expect(page.locator('.shot')).toHaveCount(1);
  await page.locator('.toast').getByRole('button',{name:'撤销'}).click();
  await expect(page.locator('.shot')).toHaveCount(2);
  await page.getByRole('button',{name:'进入拍摄日模式'}).click();
  await expect(page.locator('#sdOverlay')).toHaveClass(/show/);
  await page.getByRole('button',{name:'稍后补拍'}).first().click();
  await expect(page.locator('#sdBody')).toContainText('待补拍');
  await page.getByRole('button',{name:'取消补拍'}).click();
  await expect(page.locator('#sdBody')).not.toContainText('待补拍');
});
test('弹窗具备可访问对话框语义和 Tab 循环',async({page})=>{
  await openFreshApp(page);
  await page.getByRole('button',{name:'新建策划案'}).click();
  await expect(page.locator('#nameModal')).toHaveAttribute('aria-modal','true');
  await page.locator('#nameModal').getByRole('button',{name:'创建'}).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#nameInput')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#nameModal')).not.toHaveClass(/show/);
});

test('筛选状态跨日拖拽以实际目标为准，不重置隐藏分镜',async({page})=>{
  await page.setViewportSize({width:1440,height:1400});
  await setupV108Project(page);
  await page.evaluate(()=>{
    updateCur(p=>{
      const first=p.shots[0],d=addDays(first.date,1);
      addShootDate(p,d);
      p.shots.push({...first,id:'hidden-a',name:'隐藏分镜',ord:1},
        {...first,id:'target-b',name:'原始目标',date:d,ord:0},
        {...first,id:'hidden-b',name:'隐藏目标',date:d,ord:1});
      applyDay(p,first.date,null);applyDay(p,d,null);
    });
    renderProject();
  });
  await expect(page.locator('.shot')).toHaveCount(4);
  await page.locator('#s_filter').fill('原始');
  await expect(page.locator('.shot')).toHaveCount(2);
  const source=page.locator('[data-id="shot-a"] .drag-handle'),target=page.locator('[data-id="target-b"]');
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const start=await source.boundingBox(),end=await target.boundingBox();
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
  await page.mouse.down();
  await page.mouse.move(end.x+end.width/2,end.y+end.height*0.75,{steps:8});
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>{
    const p=cur(),a=p.shots.find(s=>s.id==='shot-a'),b=p.shots.find(s=>s.id==='target-b');
    return a.date===b.date&&a.ord===1&&p.shots.find(s=>s.id==='hidden-b').ord===2&&p.shots.find(s=>s.id==='hidden-a').ord===0;
  })).toBe(true);
});
test('直接打开本地 HTML 时基础 CSP 不阻断核心交互',async({page})=>{
  await page.goto(new URL('../../shotflow.html',import.meta.url).href);
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await createProject(page,'本地文件测试');
  await page.locator('#s_name').fill('本地分镜');
  await page.getByRole('button',{name:'添加分镜'}).click();
  await expect(page.locator('.shot')).toContainText('本地分镜');
});
test('PWA 首次缓存后离线刷新仍可打开项目',async({page,context})=>{
  await page.addInitScript(()=>{try{localStorage.setItem('wb_sf_shisei_sync','0');}catch{/* Browser storage may be unavailable. */}});
  await openFreshApp(page);
  await createProject(page,'离线项目');
  await waitProjectPersisted(page,'离线项目');
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:15000}).toBe(true);
  await context.setOffline(true);
  try{
    await page.reload();
    await expect(page.locator('.pcard',{hasText:'离线项目'})).toBeVisible();
  }finally{await context.setOffline(false);}
});

test('图库 v4 元数据与图片分离，写删事务保持一致',async({page})=>{
  await openFreshApp(page);
  const result=await page.evaluate(async()=>{
    const key='shisei:split-test',data='data:image/png;base64,AAAA';
    await idb.putShiseiImg(key,{cat:'测试',url:'images/test.png',data});
    const read=store=>new Promise((res,rej)=>{
      const r=idb.db.transaction(store).objectStore(store).get(key);
      r.onsuccess=()=>res(r.result);r.onerror=rej;
    });
    const metadata=await read('shisei_index'),image=await read('shisei_images');
    const count=(await idb.shiseiSnapshot()).rows.filter(r=>r.key===key).length;
    await idb.delShiseiImg(key);
    return idb.db.version===4&&metadata.bytes===data.length&&!('data' in metadata)&&image===data&&count===1&&!(await read('shisei_index'))&&!(await read('shisei_images'));
  });
  expect(result).toBe(true);
});
test('v3 旧图库升级保留图片、项目及同步记录',async({page})=>{
  await page.goto('/shotflow-manifest.json');
  await page.evaluate(async()=>{
    localStorage.setItem('wb_sf_shisei_sync','0');
    await new Promise((res,rej)=>{
      const r=indexedDB.open('shotflow',3);
      r.onupgradeneeded=()=>{
        const db=r.result;
        db.createObjectStore('projects').put([{id:'legacy-p',name:'迁移项目',v3:1}],'all');
        db.createObjectStore('images').put('legacy-own','own');
        db.createObjectStore('shisei_meta').put({cursor:7},'legacy-meta');
        db.createObjectStore('shisei_images').put({cat:'旧图库',data:'data:image/png;base64,AAAA'},'shisei:legacy');
      };
      r.onsuccess=()=>{r.result.close();res();};r.onerror=rej;
    });
  });
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  const result=await page.evaluate(async()=>{
    const rec=await idb.getShiseiImg('shisei:legacy'),rows=await idb.shiseiIndex();
    return !!(idb.db.version===4&&rec.data==='data:image/png;base64,AAAA'&&rows.some(r=>r.key==='shisei:legacy'&&r.cat==='旧图库')&&(await idb.getProjects()).some(p=>p.id==='legacy-p')&&(await idb.get('own'))==='legacy-own'&&(await idb.getShiseiMeta('legacy-meta')).cursor===7);
  });
  expect(result).toBe(true);
});

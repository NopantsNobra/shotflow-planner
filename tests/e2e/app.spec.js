/* E2E 关键路径测试：覆盖审核报告中纯函数测试无法触达的渲染层 / DOM 交互层。
   用法：npm run test:e2e（Playwright 自动启动 tests/e2e/static-server.mjs）
   覆盖：① 新建项目→加分镜→排程→导出文档 完整链路
        ② FB-1 渲染层回归：输入分镜名后触发重绘，输入内容不丢失
        ③ P0 持久化：页面隐藏时冲刷未落盘数据 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

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
  /* 新版示例项目自带收藏分镜，浮窗会有多条「引用收藏」；先限定到目标条目所在行再点，
     避免 strict mode 歧义（v10.9.x 引入示例收藏后暴露的定位脆弱点）。 */
  await page.locator('#favPickerBody .row').filter({ hasText:'被收藏分镜' })
    .locator('button', { hasText:'引用收藏' }).click();
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
  pack.images.same='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
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
  await expect(page.locator('#tabBody [onclick],#tabBody [onchange]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'导出所选分镜'})).toBeVisible();
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
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
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
test('PWA 首次缓存后离线刷新仍可打开项目',async({page,context,browserName,request})=>{
  await page.addInitScript(()=>{try{localStorage.setItem('wb_sf_shisei_sync','0');}catch{/* Browser storage may be unavailable. */}});
  await openFreshApp(page);
  await createProject(page,'离线项目');
  await waitProjectPersisted(page,'离线项目');
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller),{timeout:15000}).toBe(true);
  // WebKit's offline emulation aborts navigation before its service worker can answer.
  // Simulate a real unavailable origin instead, without skipping the offline cache path.
  const webkit=browserName==='webkit';
  if(webkit){
    const r=await request.post('/__e2e/navigation-failure?enabled=1');expect(r.status()).toBe(204);
  }else await context.setOffline(true);
  try{
    await page.reload();
    await expect(page.locator('.pcard',{hasText:'离线项目'})).toBeVisible();
  }finally{
    if(webkit)await request.post('/__e2e/navigation-failure?enabled=0');
    else await context.setOffline(false);
  }
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

test('图库冷缓存受数量限制，活动项目引用不被回收',async({page})=>{
  await setupV108Project(page);
  const result=await page.evaluate(async()=>{
    const active='shisei:pinned',data='data:image/png;base64,AAAA';
    updateCur(p=>{p.shots[0].refIds=[active];});
    imgCache[active]=data;
    for(let i=0;i<120;i++){const k='shisei:cold'+i;imgCache[k]=data;poseCacheAccess.set(k,Date.now()+i);}
    trimImageCache();
    const bounded=Object.keys(imgCache).filter(k=>k.startsWith('shisei:cold')).length<=POSE_CACHE_MAX;
    trimImageCache(true);
    return bounded&&imgCache[active]===data&&!Object.keys(imgCache).some(k=>k.startsWith('shisei:cold'));
  });
  expect(result).toBe(true);
});

test('参考图键盘选择和勾选分镜保留表单及节点身份',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(async()=>{
    const data='data:image/png;base64,AAAA';
    await idb.put('keyboard-ref',data);imgCache['keyboard-ref']=data;
    updateCur(p=>p.refs.push({id:'keyboard-r',key:'keyboard-ref',name:'键盘参考',tags:['参考']}));
    await renderShots(cur());
    window.__formNode=document.getElementById('s_name');
  });
  await page.locator('#s_name').fill('保留草稿');
  const ref=page.locator('[data-ref-key="keyboard-ref"]');
  await ref.focus();await page.keyboard.press('Space');
  await expect(ref).toHaveAttribute('aria-pressed','true');await expect(ref).toBeFocused();
  await page.locator('.shot .chk').click();
  await expect(page.locator('.shot .chk')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#s_name')).toHaveValue('保留草稿');
  expect(await page.evaluate(()=>window.__formNode===document.getElementById('s_name'))).toBe(true);
});
test('看板支持键盘打开项目，切页保留项目头部',async({page})=>{
  await openFreshApp(page);await createProject(page,'键盘项目');
  await page.keyboard.press('Escape');
  const card=page.getByRole('button',{name:'打开项目 键盘项目'});
  await card.focus();await page.keyboard.press('Enter');await expect(page.locator('#s_name')).toBeVisible();
  await page.evaluate(()=>window.__meta=document.querySelector('.metacard'));
  await page.locator('[data-project-tab="mood"]').click();
  await expect(page.locator('[data-project-tab="mood"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.__meta===document.querySelector('.metacard'))).toBe(true);
});

test('静态 shell 不依赖内联事件，委托动作仍可键盘创建项目',async({page})=>{
  await openFreshApp(page);
  expect(await page.locator('#nameModal [onclick],#nameModal [onkeydown],#settingsModal[onclick],#deployModal[onclick],#favPickerModal[onclick]').count()).toBe(0);
  await page.getByRole('button',{name:'新建策划案'}).click();
  await page.locator('#nameInput').fill('CSP 委托测试');
  await page.locator('#nameInput').press('Enter');
  await expect(page.locator('.phead h1')).toContainText('CSP 委托测试');
});
test('持久化连接失效后恢复，修改分镜与日程并刷新仍保留',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(()=>{
    idb.db.close(); // Simulate a stale connection while idb.ready() still reports true.
    updateCur(p=>{p.shots[0].name='恢复后分镜';p.schedule.push({id:'recover-node',date:p.shootDate,title:'恢复后日程',start:'12:00',end:'12:30'});});
  });
  await expect.poll(()=>page.evaluate(async()=>{
    try{const p=(await idb.getProjects()).find(x=>x.id==='v108-test');return p.shots[0].name==='恢复后分镜'&&p.schedule.some(n=>n.title==='恢复后日程')&&!pendingPersist&&!persistFailed;}catch{return false;}
  }),{timeout:15000}).toBe(true);
  await page.reload();await page.locator('.pcard',{hasText:'V108 测试案'}).click();
  await expect(page.locator('.shot')).toContainText('恢复后分镜');
  expect(await page.evaluate(()=>cur().schedule.some(n=>n.title==='恢复后日程'))).toBe(true);
});
test('配额失败明确显示诊断、保留草稿，手动重试可恢复',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(()=>{
    window.__merge=idb.mergeProjects;
    idb.mergeProjects=async()=>{throw new DOMException('test quota','QuotaExceededError');};
    updateCur(p=>{p.shots[0].name='未落盘草稿';});
  });
  await expect(page.locator('#persistFailureTip')).toContainText('QuotaExceededError');
  expect(await page.evaluate(()=>cur().shots[0].name)).toBe('未落盘草稿');
  await page.evaluate(()=>{idb.mergeProjects=window.__merge;});
  await page.getByRole('button',{name:'重新尝试保存'}).click();
  await expect(page.locator('#persistFailureTip')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(async()=> (await idb.getProjects()).find(p=>p.id==='v108-test').shots[0].name)).toBe('未落盘草稿');
});


test('v5 项目包追加多个策划案且拒绝歧义类型，保留原项目',async({page})=>{
  await setupV108Project(page);
  await page.keyboard.press('Escape');
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
  const pack={app:'stillmark',version:5,type:'project-pack',packVersion:1,entries:[
    {name:'迁移项目甲',shots:[{id:'s',name:'已完成镜头',done:true,sceneId:'c',refIds:['img']}],scenes:[{id:'c',name:'场景甲'}],refs:[{key:'img'}]},
    {name:'迁移项目乙',shots:[{name:'第二镜头',refIds:['img']}]}
  ],images:{img:image}};
  const upload=async(data)=>page.locator('#importFile').setInputFiles({name:'pack.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await upload({...pack,projects:pack.entries});
  await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
  await expect(page.locator('.toast')).toContainText('歧义');
  await upload(pack);
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await expect(page.locator('#confirmDesc')).toContainText('保留现有数据');
  await page.locator('#confirmOk').click();
  await expect(page.locator('.pcard',{hasText:'迁移项目甲'})).toBeVisible();
  await expect(page.locator('.pcard',{hasText:'迁移项目乙'})).toBeVisible();
  await expect(page.locator('.pcard',{hasText:'V108 测试案'})).toBeVisible();
  expect(await page.evaluate(async()=>{
    const ps=await idb.getProjects(),a=ps.find(p=>p.name.includes('迁移项目甲')),b=ps.find(p=>p.name.includes('迁移项目乙'));
    return a.shots[0].done&&a.shots[0].sceneId===a.scenes[0].id&&a.shots[0].refIds[0]===b.shots[0].refIds[0]&&!!(await idb.get(a.shots[0].refIds[0]));
  })).toBe(true);
  await page.reload();
  await expect(page.locator('.pcard',{hasText:'迁移项目甲'})).toBeVisible();
});


test('看板选择两个完整项目打包，保留各自执行状态',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(()=>{updateCur(p=>p.shots[0].done=true);});
  await page.keyboard.press('Escape');
  await createProject(page,'第二策划');
  await page.keyboard.press('Escape');
  await expect(page.locator('#app [onclick],#app [onchange]')).toHaveCount(0);
  await page.getByRole('button',{name:'打包项目'}).click();
  await page.getByRole('button',{name:'选择项目 V108 测试案'}).click();
  await page.getByRole('button',{name:'选择项目 第二策划'}).click();
  await expect(page.locator('#boardPackCount')).toHaveText('已选 2 个项目');
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出所选项目'}).click()]);
  const bytes=Array.from(readFileSync(await download.path()));
  const data=await page.evaluate(async bytes=>{
    const archive=await openAssetArchive(new Blob([Uint8Array.from(bytes)]),globalThis.zip);
    try{return archive.data;}finally{await archive.close();}
  },bytes);
  expect(data.kind).toBe('projects');
  expect(data.entries.map(p=>p.name).sort()).toEqual(['V108 测试案','第二策划'].sort());
  expect(data.entries.find(p=>p.name==='V108 测试案').shots[0].done).toBe(true);
});

test('非收藏分镜精确导出并导入新项目，保留原始项目和图片',async({page})=>{
  await setupV108Project(page);
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
  await page.evaluate(async(image)=>{
    await idb.put('portable-ref',image);
    imgCache['portable-ref']=image;
    updateCur(p=>{
      p.client='不应进入分镜包的客户';
      p.refs.push({id:'portable-meta',key:'portable-ref',name:'参考图',tags:['参考']});
      p.scenes.push({id:'portable-scene',name:'选中场景'});
      Object.assign(p.shots[0],{refIds:['portable-ref'],sceneId:'portable-scene',done:true,fav:false});
      p.shots.push({...p.shots[0],id:'not-selected',name:'未选择分镜',done:false});
    });
    await renderShots(cur());
  },image);
  await page.getByRole('button',{name:'批量编辑'}).click();
  await page.locator('.shot',{hasText:'原始分镜'}).locator('.batch-check').check();
  const [download]=await Promise.all([page.waitForEvent('download'),(async()=>{
    await page.getByRole('button',{name:'导出所选分镜'}).click();
    await expect(page.locator('.toast')).toContainText('已导出');
  })()]);
  const zipBytes=readFileSync(await download.path());
  const pack=await page.evaluate(async bytes=>{
    const a=await openAssetArchive(new Blob([Uint8Array.from(bytes)]),globalThis.zip);
    const images={};await a.consumeImages(async(keys,b)=>{const v=await archiveDataURL(b);keys.forEach(k=>images[k]=v);});
    return {...a.data,images};
  },Array.from(zipBytes));
  expect(pack.kind).toBe('shots');
  expect(pack.entries).toHaveLength(1);
  const entry=pack.entries[0];
  expect(entry.shots.map(s=>s.name)).toEqual(['原始分镜']);
  expect(entry.shots[0].done).toBe(true);
  expect(entry.client).toBeUndefined();
  expect(entry.scenes).toHaveLength(1);
  expect(pack.images['portable-ref']).toBe(image);
  await page.keyboard.press('Escape');
  await page.locator('#importFile').setInputFiles({name:'shots.stillmark.zip',mimeType:'application/zip',buffer:zipBytes});
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  // v11.0.1 起 shots 包带 targetHint，预览会预选源项目；本用例验证"导入为新项目"，显式选回"创建新的策划案"。
  await page.locator('#archiveImportTarget').selectOption('');
  await page.locator('#confirmOk').click();
  await expect(page.locator('#packResultModal')).toHaveClass(/show/);
  await page.locator('[data-shell-action="close-pack-result"]').click();
  await expect(page.locator('.pcard',{hasText:'分镜选集'})).toBeVisible();
  expect(await page.evaluate(async()=>{
    const ps=await idb.getProjects(),original=ps.find(p=>p.id==='v108-test'),imported=ps.find(p=>p.name.includes('分镜选集'));
    const s=imported.shots[0];return original.shots.length===2&&s.done&&s.sceneId===imported.scenes[0].id&&s.refIds[0]!=='portable-ref'&&!!(await idb.get(s.refIds[0]));
  })).toBe(true);
});


test('公开 Agent ZIP 示例经生产导入器校验图片并刷新持久化',async({page})=>{
  await openFreshApp(page);
  const shotPack=readFileSync(new URL('../../examples/agent-shot-with-image-v1.stillmark.zip',import.meta.url));
  await page.locator('#importFile').setInputFiles({name:'agent-shot-with-image-v1.stillmark.zip',mimeType:'application/zip',buffer:shotPack});
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await expect(page.locator('#confirmDesc')).toContainText('窗边人像策划');
  await expect(page.locator('#confirmDesc')).toContainText('1 个图片引用');
  await page.locator('#confirmOk').click();
  await expect(page.locator('.toast')).toContainText('导入成功');
  // v11.0.1 起导入成功后弹出回执 modal，会遮挡后续项目卡片点击；先确认回执内容再关闭。
  await expect(page.locator('#packResultModal')).toHaveClass(/show/);
  await expect(page.locator('#packResultText')).toHaveValue(/窗边人像策划/);
  await page.locator('[data-shell-action="close-pack-result"]').click();
  await page.locator('.pcard',{hasText:'窗边人像策划'}).click();
  await expect(page.locator('.shot')).toContainText('窗边侧光半身');
  await expect.poll(()=>page.locator('.shot img').first().evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  const projectPack=readFileSync(new URL('../../examples/agent-project-v1.stillmark.zip',import.meta.url));
  await page.locator('#importFile').setInputFiles({name:'agent-project-v1.stillmark.zip',mimeType:'application/zip',buffer:projectPack});
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await expect(page.locator('#confirmDesc')).toContainText('城市漫步人像');
  await page.locator('#confirmOk').click();
  await expect(page.locator('#packResultModal')).toHaveClass(/show/);
  await page.locator('[data-shell-action="close-pack-result"]').click();
  await expect(page.locator('.pcard',{hasText:'城市漫步人像'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.pcard',{hasText:'窗边人像策划'})).toBeVisible();
  await expect(page.locator('.pcard',{hasText:'城市漫步人像'})).toBeVisible();
});


test('ZIP 暂存隔离、原子发布、冲突和碰撞回滚及过期清理',async({page})=>{
  await setupV108Project(page);
  const result=await page.evaluate(async()=>{
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
    const original=await idb.getProjects(),expected=JSON.stringify(original);
    await idb.stageArchiveImage('first','zip-new',image);
    const isolated=!(await idb.get('zip-new'))&&(await idb.get(['archive-stage-v1','first','image','zip-new']))===image;
    const mismatch=await idb.publishArchiveStage(original,'null','first',['zip-new'])===false;
    const retained=!(await idb.get('zip-new'))&&!!(await idb.get(['archive-stage-v1','first','image','zip-new']));
    const project={...original[0],id:'zip-project',name:'ZIP 原子发布',shots:[]};
    const ok=await idb.publishArchiveStage(original.concat(project),expected,'first',['zip-new']);
    const committed=ok&&(await idb.get('zip-new'))===image&&!(await idb.get(['archive-stage-v1','first','image','zip-new']))&&(await idb.getProjects()).some(p=>p.id==='zip-project');
    const baseline=JSON.stringify(await idb.getProjects());
    await idb.stageArchiveImage('collision','zip-another',image);await idb.stageArchiveImage('collision','zip-new',image);
    let rolled=false;
    try{await idb.publishArchiveStage([],baseline,'collision',['zip-another','zip-new']);}catch{rolled=true;}
    const protectedData=rolled&&!(await idb.get('zip-another'))&&(await idb.get('zip-new'))===image&&JSON.stringify(await idb.getProjects())===baseline;
    await idb.discardArchiveStage('collision');
    const cleaned=!(await idb.get(['archive-stage-v1','collision','image','zip-another']));
    await idb.stageArchiveImage('expired','old-image',image);
    await idb.reapArchiveStages(Date.now()+25*60*60*1000);
    const reaped=!(await idb.get(['archive-stage-v1','expired','image','old-image']))&&(await idb.get('zip-new'))===image;
    return {isolated,mismatch,retained,committed,protectedData,cleaned,reaped};
  });
  expect(result).toEqual({isolated:true,mismatch:true,retained:true,committed:true,protectedData:true,cleaned:true,reaped:true});
});


test('ZIP 导入确认前不写入，取消暂存时项目及图片均不改变',async({page})=>{
  await setupV108Project(page);await page.keyboard.press('Escape');
  const bytes=await page.evaluate(async()=>{
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
    const parts=[];
    await writeAssetArchive({dataVersion:1,kind:'projects',entries:[{name:'取消导入测试',refs:[{key:'a'},{key:'b'}]}]},()=>archiveImageBlob(image),new WritableStream({write(c){parts.push(c.slice());}}),globalThis.zip);
    window.__archiveBaseline=JSON.stringify(await idb.getProjects());window.__archiveKeys=JSON.stringify(await idb.keys());
    return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
  });
  const upload=()=>page.locator('#importFile').setInputFiles({name:'cancel.stillmark.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
  await upload();await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  expect(await page.evaluate(async()=>JSON.stringify(await idb.keys())===window.__archiveKeys)).toBe(true);
  await page.locator('#confirmModal').getByRole('button',{name:'取消'}).click();
  await expect(page.locator('#confirmModal')).not.toHaveClass(/show/);
  // Gate the first staging call; cancel via the real button after the first write.
  await page.evaluate(()=>{
    const stage=idb.stageArchiveImage;
    window.__staged=0;
    idb.stageArchiveImage=async(...args)=>{
      await stage(...args);window.__staged++;
      if(window.__staged===1)await new Promise(resolve=>{window.__resumeArchive=resolve;});
    };
  });
  await upload();await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await page.locator('#confirmOk').click();
  await expect.poll(()=>page.evaluate(()=>window.__staged)).toBe(1);
  await expect(page.locator('#archiveProgressModal')).toHaveClass(/show/);
  await page.locator('#archiveCancel').click();await page.evaluate(()=>window.__resumeArchive());
  await expect(page.locator('#archiveProgressModal')).not.toHaveClass(/show/);
  await expect(page.locator('#toast')).toContainText('取消');
  expect(await page.evaluate(async()=>JSON.stringify(await idb.getProjects())===window.__archiveBaseline&&JSON.stringify(await idb.keys())===window.__archiveKeys)).toBe(true);
});


test('ZIP 直接保存：特性检测、分块写出、取消选择与写入失败不降级下载',async({page})=>{
  await page.goto('/shotflow.html');await expect(page.locator('#app')).toBeVisible();
  const result=await page.evaluate(async()=>{
    const original=globalThis.showSaveFilePicker,parts=[];let closed=0,aborts=0,picks=0,downloads=0,writeCount=0;
    const download=downloadBlob;downloadBlob=()=>{downloads++;};
    const data=[{name:'流式保存测试',shots:[{name:'一张分镜'}]}];
    try{
      globalThis.showSaveFilePicker=async options=>{
        picks++;
        if(!options.suggestedName.endsWith('.stillmark.zip'))throw Error('bad filename');
        return {createWritable:async()=>new WritableStream({
          write(c){parts.push(c.slice());writeCount++;},close(){closed++;},abort(){aborts++;}
        })};
      };
      const supported=archiveCanSaveToFile();
      await exportArchiveProjects(data,'projects',true);
      const saved=await openAssetArchive(new Blob(parts),globalThis.zip),name=saved.data.entries[0].name;await saved.close();
      globalThis.showSaveFilePicker=async()=>{picks++;throw new DOMException('cancel','AbortError');};
      await exportArchiveProjects(data,'projects',true);
      globalThis.showSaveFilePicker=async()=>({createWritable:async()=>new WritableStream({write(){throw Error('disk failure');}})});
      await exportArchiveProjects(data,'projects',true);
      const errorShown=document.getElementById('toast').textContent.includes('未完成');
      globalThis.showSaveFilePicker=async()=>({createWritable:async()=>new WritableStream({abort(){aborts++;}})});
      await exportArchiveProjects([{bad:'schema'}],'projects',true);
      return {supported,name,picks,closed,multiple:writeCount>1,downloads,aborts,errorShown,clean:!archiveOperation};
    }finally{globalThis.showSaveFilePicker=original;downloadBlob=download;}
  });
  expect(result).toEqual({supported:true,name:'流式保存测试',picks:2,closed:1,multiple:true,downloads:0,aborts:1,errorShown:true,clean:true});
});


test('分镜 ZIP 指定目标追加：保留客户资料与旧分镜，只新增选中依赖',async({page})=>{
  await setupV108Project(page);
  await page.evaluate(()=>{updateCur(p=>{p.client='原客户';p.shots[0].done=true;p.scenes=[{id:'existing-scene',name:'窗边',note:'原场景'}];p.notes=[{id:'existing-note',kind:'备注',content:'原备注',ts:1}];});});
  await page.keyboard.press('Escape');
  const bytes=await page.evaluate(async()=>{
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==',parts=[];
    const model={dataVersion:1,kind:'shots',entries:[{name:'追加来源',client:'不应写入',shots:[{id:'s',name:'新增分镜',sceneId:'sc',refIds:['pic'],date:'2026-12-01',done:true}],scenes:[{id:'sc',name:'窗边'},{id:'unrelated',name:'忽略'}],refs:[{key:'pic',tags:['新标签']},{key:'extra'}],notes:[{content:'无关隐私'}]}]};
    await writeAssetArchive(model,()=>archiveImageBlob(image),new WritableStream({write(c){parts.push(c.slice());}}),globalThis.zip);
    return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
  });
  await page.locator('#importFile').setInputFiles({name:'append.stillmark.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await expect(page.locator('#archiveImportTarget')).toBeVisible();
  await page.locator('#archiveImportTarget').selectOption('v108-test');
  await expect(page.locator('#confirmDesc')).toContainText('追加');
  await page.locator('#confirmOk').click();
  await expect(page.locator('#toast')).toContainText('已向');
  const result=await page.evaluate(async()=>{
    const ps=await idb.getProjects(),p=ps.find(p=>p.id==='v108-test'),s=p.shots.find(x=>x.name==='新增分镜'),keys=await idb.keys();
    return {count:ps.length,client:p.client,old:p.shots[0].done,added:s.done,scenes:p.scenes.length,linked:p.scenes.some(x=>x.id===s.sceneId&&x.name==='窗边'),notes:p.notes.map(x=>x.content),refs:p.refs.length,dates:p.shootDates,exists:!!(await idb.get(s.refIds[0])),imageCount:keys.filter(k=>typeof k==='string'&&k.startsWith('archive-')).length};
  });
  expect(result).toMatchObject({count:1,client:'原客户',old:true,added:true,scenes:2,linked:true,notes:['原备注'],refs:1,dates:['2026-11-24','2026-12-01'],exists:true,imageCount:1});
  await page.reload();await page.locator('.pcard',{hasText:'V108 测试案'}).click();
  await expect(page.locator('.shot',{hasText:'新增分镜'})).toBeVisible();
});

/* Strict-CSP Phase 2：清单/预算/协作域改为 data-do 白名单委托后的回归。 */
test('Phase2 支持域无内联事件，委托动作在重绘后仍生效',async({page})=>{
  await setupV108Project(page);
  await page.locator('.ptab',{hasText:'清单'}).first().click();
  await expect(page.locator('#f_scenes')).toBeVisible();
  // ① 动态模板不再含可执行内联事件
  const inline=await page.evaluate(()=>document.querySelectorAll('#tabBody [onclick],#tabBody [onkeydown],#tabBody [onchange]').length);
  expect(inline).toBe(0);
  // ② click 委托：添加场景 → 列表出现 → 勾选 → 再删除（每次都会 renderProject 全量重绘）
  await page.locator('#f_scenes').fill('委托测试场景');
  await page.locator('[data-do="add-stuff"]').first().click();
  await expect(page.locator('#tabBody')).toContainText('委托测试场景');
  const row=page.locator('[data-fid]').filter({hasText:'委托测试场景'}).first();
  await row.locator('[data-do^="toggle-stuff"]').click();
  await expect(page.locator('[data-fid]').filter({hasText:'委托测试场景'}).first().locator('.chk.on')).toBeVisible();
  // ③ 白名单拒绝未注册 action（注入 data-do 不应触发任何业务函数）
  const before=await page.locator('[data-fid]').count();
  await page.evaluate(()=>{
    const b=document.createElement('button');b.dataset.do='__evil__';b.textContent='evil';b.id='evilBtn';
    document.getElementById('tabBody').appendChild(b);
  });
  await page.locator('#evilBtn').click();
  expect(await page.locator('[data-fid]').count()).toBe(before);
  // ④ 参数类型校验：篡改 data-a0 为非 JSON，点击不应产生新条目
  await page.evaluate(()=>{
    const b=document.querySelector('[data-do="add-stuff"]');if(b)b.dataset.a0='not-json';
  });
  await page.locator('[data-do="add-stuff"]').first().click();
  await expect(page.locator('#tabBody')).toContainText('委托测试场景');
  expect(await page.locator('[data-fid]').filter({hasText:'委托测试场景'}).count()).toBe(1);
});

test('CSP 公共编辑按钮接受可选空 key，严格拒绝空必填参数',async({page})=>{
  await setupV108Project(page);
  const edit=page.locator('.shot [data-do="begin-inline-edit"]').first();
  await edit.click();
  await expect.poll(()=>page.evaluate(()=>view.editingShotEditId)).toBe('shot-a');
  const validation=await page.evaluate(()=>{
    const spec=ACTIONS['begin-inline-edit'];
    return {optional:readActionArgs({dataset:{a0:'"Shot"',a1:'"shot-a"',a2:'""'}},spec),
      required:readActionArgs({dataset:{a0:'"Shot"',a1:'""',a2:'""'}},spec)};
  });
  expect(validation.optional).toEqual(['Shot','shot-a','']);
  expect(validation.required).toBeNull();
});

test('CSP 日程与拍摄日无内联事件，键盘添加、锁时及现场状态有效',async({page})=>{
  await setupV108Project(page);
  await page.locator('[data-project-tab="schedule"]').click();
  await expect(page.locator('#tabBody [onclick],#tabBody [onchange],#tabBody [onkeydown]')).toHaveCount(0);
  await page.locator('#n_title').fill('委托日程');
  await page.locator('#n_start').fill('12:00');
  await page.locator('#n_end').fill('12:30');
  await page.locator('#n_title').press('Enter');
  await expect(page.locator('#tabBody')).toContainText('委托日程');
  const id=await page.evaluate(()=>cur().schedule.find(n=>n.title==='委托日程').id);
  const button=page.locator('[data-do="toggle-node-lock"]').filter({hasText:'锁时'});
  // The only non-auto event is the one added above.
  await button.click();
  expect(await page.evaluate(id=>cur().schedule.find(n=>n.id===id).timeLocked,id)).toBe(true);
  await page.getByRole('button',{name:'进入拍摄日模式'}).click();
  await expect(page.locator('#sdOverlay')).toHaveClass(/show/);
  await expect(page.locator('#sdBody [onclick],#sdBody [onchange],#sdBody [onkeydown]')).toHaveCount(0);
  await page.getByRole('button',{name:'稍后补拍'}).first().click();
  await expect(page.locator('#sdBody')).toContainText('待补拍');
  await page.getByRole('button',{name:'取消补拍'}).first().click();
  await expect(page.locator('#sdBody')).not.toContainText('待补拍');
  await page.locator('[data-do="close-shoot-day"]').click();
  await expect(page.locator('#sdOverlay')).not.toHaveClass(/show/);
});

test('CSP 看板、收藏与设置动作不依赖内联事件',async({page})=>{
  await openFreshApp(page);
  await expect(page.locator('#app [onclick],#app [oninput],#app [onchange]')).toHaveCount(0);
  await createProject(page,'委托看板回归');
  await page.keyboard.press('Escape');
  await page.locator('#boardSearch').fill('委托看板回归');
  await expect(page.locator('.pcard')).toHaveCount(1);
  await page.locator('.pcard').click();
  await expect(page.locator('#s_name')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'设置',exact:false}).click();
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
  await expect(page.locator('#settingsModal [onclick],#settingsModal [onchange]')).toHaveCount(0);
  await page.getByRole('button',{name:'为自己部署'}).click();
  await expect(page.locator('#deployModal')).toHaveClass(/show/);
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.locator('[data-do="open-favorites"]').click();
  await expect(page.locator('#app [onclick],#app [onchange]')).toHaveCount(0);
  await page.getByRole('button',{name:'返回看板'}).click();
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
});

test('CSP 项目资料与情绪板委托输入、上传及筛选',async({page})=>{
  await setupV108Project(page);
  await expect(page.locator('.metacard [onchange],.workspace-control [onchange],.ptabs [onclick]')).toHaveCount(0);
  const client=page.locator('[data-field="client"]');await client.fill('委托客户');await client.press('Tab');
  expect(await page.evaluate(()=>cur().client)).toBe('委托客户');
  await page.locator('[data-project-tab="mood"]').click();
  await expect(page.locator('#tabBody [onclick],#tabBody [onchange],#tabBody [oninput],#tabBody [onkeydown],#tabBody [ondrop]')).toHaveCount(0);
  await page.locator('#m_text').fill('委托灵感');await page.locator('#m_tag').fill('测试标签');await page.locator('#m_text').press('Enter');
  await expect(page.locator('#tabBody')).toContainText('委托灵感');
  await page.locator('#m_filter').fill('不存在的标签');
  await expect(page.locator('.mood-item')).toHaveCount(0);
  await page.locator('[data-do="clear-mood-filter"]').click();
  await expect(page.locator('.mood-item')).toHaveCount(1);
});

test('CSP 分镜委托输入与操作保留草稿、筛选及批量选择',async({page})=>{
  await setupV108Project(page);
  await expect(page.locator('#tabBody [onclick],#tabBody [onchange],#tabBody [oninput],#tabBody [onkeydown],#tabBody [ondrop]')).toHaveCount(0);
  await page.locator('#s_name').fill('委托分镜');
  await page.locator('#s_dur').selectOption('30');
  await page.locator('#s_name').press('Enter');
  await expect(page.locator('.shot').filter({hasText:'委托分镜'})).toBeVisible();
  await page.locator('#s_filter').fill('委托分镜');
  await expect(page.locator('.shot')).toHaveCount(1);
  await page.getByRole('button',{name:'批量编辑'}).click();
  await page.locator('.batch-check').check();
  await expect(page.locator('#batchCount')).toContainText('1');
  await page.locator('.shot [data-do="toggle-must-shoot"]').click();
  await expect(page.locator('.shot')).toContainText('必拍');
});

test('严格脚本 CSP：阻止未授权脚本和事件属性，正常动作可用',async({page})=>{
  await openFreshApp(page);
  const result=await page.evaluate(()=>{
    const policy=document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    window.__cspInline=0;window.__cspScript=0;
    const button=document.createElement('button');button.setAttribute('onclick','window.__cspInline=1');
    document.body.append(button);button.click();button.remove();
    const script=document.createElement('script');script.textContent='window.__cspScript=1';document.body.append(script);script.remove();
    return {policy,inline:window.__cspInline,script:window.__cspScript};
  });
  expect(result.policy).toContain("script-src-attr 'none'");
  expect(result.inline).toBe(0);expect(result.script).toBe(0);
  await createProject(page,'严格 CSP 项目');
  await page.locator('#s_name').fill('正常委托分镜');
  await page.locator('#s_name').press('Enter');
  await expect(page.locator('.shot')).toContainText('正常委托分镜');
});
test('独立提案脚本哈希与实际导出内容一致，离线打开仍可缩放且拒绝注入',async({page},testInfo)=>{
  await setupV108Project(page);
  await page.locator('[data-do="open-doc"]').filter({hasText:'客户提案'}).click();
  await expect(page.locator('#docExportBtn')).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#docExportBtn').click()]);
  const proposalPath=testInfo.outputPath('proposal.html');
  await download.saveAs(proposalPath);
  const html=readFileSync(proposalPath,'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash=createHash('sha256').update(script,'utf8').digest('base64');
  expect(html).toContain("script-src 'sha256-"+hash+"'");
  expect(html).toContain("script-src-attr 'none'");
  expect(html).not.toMatch(/\s(?:on[a-z]+)\s*=\s*["']/i);

  // Opening the actual download checks the browser's enforcement, not only a string hash.
  await page.setViewportSize({width:900,height:1000});
  await page.goto(pathToFileURL(proposalPath).href);
  const sheet=page.locator('.cv-sheet');
  await expect(sheet).toBeVisible();
  await expect.poll(()=>sheet.evaluate(el=>el.style.transform)).toMatch(/^scale\(/);
  const wide=await sheet.evaluate(el=>el.style.transform);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>sheet.evaluate(el=>el.style.transform)).not.toBe(wide);
  const result=await page.evaluate(()=>{
    window.__proposalInjected=0;
    const button=document.createElement('button');
    button.setAttribute('onclick','window.__proposalInjected=1');
    document.body.append(button);button.click();button.remove();
    const script=document.createElement('script');
    script.textContent='window.__proposalInjected=2';
    document.body.append(script);script.remove();
    return window.__proposalInjected;
  });
  expect(result).toBe(0);
});


/* Use actual browser fetch + intercepted HTTP responses, not a replacement window.fetch.
   The isolated context disables service workers so they cannot bypass request interception. */
test.describe('CSP 正常业务网络与图片链路',()=>{
  test.use({serviceWorkers:'block'});

  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==','base64');

  async function watchCsp(page){
    await page.addInitScript(()=>{
      window.__cspViolations=[];
      document.addEventListener('securitypolicyviolation',e=>{
        if(e.disposition==='enforce')window.__cspViolations.push({directive:e.effectiveDirective,blocked:e.blockedURI});
      });
      try{localStorage.setItem('wb_sf_shisei_sync','0');}catch{/* No storage on initial blank document. */}
    });
  }

  test('允许图库目录与图片请求、反馈 POST，且无 CSP 违规',async({page,context})=>{
    await watchCsp(page);
    const requests=[];
    const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type, accept'};
    await context.route('https://cdn.jsdelivr.net/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname.endsWith('/data/catalog.json')){
        requests.push('catalog');
        await route.fulfill({status:200,headers:cors,contentType:'application/json',
          body:JSON.stringify([{id:'csp-pose',class_cn:'CSP 测试',name_cn:'测试姿势',views:{front:'fixture.png'}}])});
      }else if(url.pathname.endsWith('/images/line/w300/fixture.png')){
        requests.push('image');
        await route.fulfill({status:200,headers:cors,contentType:'image/png',body:png});
      }else await route.abort();
    });
    await context.route('https://api.web3forms.com/submit',async route=>{
      const method=route.request().method();
      if(method==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
      requests.push(method);
      await route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify({success:true})});
    });
    await openFreshApp(page);
    await expect.poll(()=>page.evaluate(()=>!pendingPersist&&!persistFailed)).toBe(true);
    // Manual one-off sync must work with Settings open and automatic sync paused.
    await page.getByRole('button',{name:'⚙ 设置'}).click();
    const status=page.locator('#settingsShiseiBox');
    await expect(status).toContainText('已暂停');
    await status.getByRole('button',{name:'立即同步'}).click();
    await expect.poll(()=>page.evaluate(async()=>!!(await idb.getShiseiImg('shisei:csp-pose:front'))&&!shiseiState.running)).toBe(true);
    await expect(status).toContainText('1 张');
    await expect(status).toContainText('已暂停');
    expect(await page.evaluate(()=>localStorage.getItem('wb_sf_shisei_sync'))).toBe('0');
    const pose=await page.evaluate(()=>idb.getShiseiImg('shisei:csp-pose:front'));
    expect(pose.data).toBe('data:image/png;base64,'+png.toString('base64'));
    expect(requests).toContain('catalog');expect(requests).toContain('image');

    await page.locator('#fbTitle').fill('仅测试，不实际发送');
    await page.getByRole('button',{name:'提交反馈'}).click();
    await expect(page.locator('.toast')).toContainText('反馈已提交，感谢！');
    expect(requests).toContain('POST');
    expect(await page.evaluate(()=>window.__cspViolations)).toEqual([]);
  });

  test('本地图片上传、压缩、导出和再次导入均无 CSP 违规',async({page})=>{
    await watchCsp(page);
    await openFreshApp(page);
    await createProject(page,'CSP 图片迁移');
    await page.locator('[data-project-tab="mood"]').click();
    await page.locator('#m_img').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});
    await expect.poll(()=>page.evaluate(()=>cur().mood.filter(m=>m.type==='image').length)).toBe(1);
    const image=page.locator('#moodGrid img').first();
    await expect.poll(()=>image.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
    await waitProjectPersisted(page,'CSP 图片迁移');
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-do="export-project"]').click()]);
    const pack=JSON.parse(readFileSync(await download.path(),'utf8'));
    const key=pack.project.mood.find(m=>m.type==='image').content;
    expect(pack.images[key]).toMatch(/^data:image\/jpeg;base64,/);
    await page.keyboard.press('Escape');
    await page.locator('#importFile').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
    await expect(page.locator('#confirmModal')).toHaveClass(/show/);
    await page.locator('#confirmOk').click();
    await expect.poll(()=>page.evaluate(async()=>{
      const ps=(await idb.getProjects()).filter(p=>p.name.includes('CSP 图片迁移'));
      if(ps.length!==2)return false;
      const keys=ps.map(p=>p.mood.find(m=>m.type==='image')?.content);
      return keys.every(Boolean)&&keys[0]!==keys[1]&&(await idb.get(keys[0]))===(await idb.get(keys[1]));
    })).toBe(true);
    expect(await page.evaluate(()=>window.__cspViolations)).toEqual([]);
  });
});


test('PWA 旧缓存策略升级至严格 CSP，项目与图片保持完整',async({page})=>{
  await page.addInitScript(()=>{try{localStorage.setItem('wb_sf_shisei_sync','0');}catch{/* No storage on initial blank document. */}});
  // Register the previous cache-version worker before loading the app.
  await page.goto('/shotflow-manifest.json');
  const legacyCache='shotflow-v10-18';
  const currentCache=readFileSync(new URL('../../shotflow-sw.js',import.meta.url),'utf8').match(/const CACHE = '([^']+)'/)[1];
  await page.evaluate(async()=>{
    await navigator.serviceWorker.register('/shotflow-sw.js?e2e-legacy=1');
  });
  await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||''),{timeout:15000}).toContain('e2e-legacy=1');
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOck23AwMDAxMDAwMDAAAAPKgE7rCeNpwAAAABJRU5ErkJggg==';
  await page.evaluate(async({legacyCache,image})=>{
    // Seed existing v4 user data, and make the old app cache carry the baseline policy.
    // Runtime JS is the current build: this fixture isolates the worker/cache-policy transition.
    const cache=await caches.open(legacyCache);
    const url=new URL('/shotflow.html',location.origin).href;
    const cached=await cache.match(url);
    if(!cached)throw Error('legacy app cache missing');
    const html=(await cached.text()).replace(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/,
      '<meta http-equiv="Content-Security-Policy" content="object-src \'none\'; base-uri \'none\'; form-action \'none\'">');
    await cache.put(url,new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8'}}));
    const now=Date.now(),date='2026-11-24';
    const project={id:'legacy-csp-project',v3:1,name:'升级保留项目',status:'策划中',shootDate:date,shootDates:[date],dayInit:[date],
      createdAt:now,updatedAt:now,concept:{},refs:[{id:'legacy-ref',key:'legacy-image',name:'旧参考图'}],
      mood:[{id:'legacy-mood',type:'image',content:'legacy-image',fav:true}],shots:[],schedule:[],scenes:[],items:[],budget:[],notes:[],todos:[]};
    await new Promise((res,rej)=>{
      const r=indexedDB.open('shotflow',4);
      r.onupgradeneeded=()=>{
        const db=r.result;
        for(const name of ['projects','images','shisei_meta','shisei_images','shisei_index'])db.createObjectStore(name);
      };
      r.onerror=()=>rej(r.error);
      r.onsuccess=()=>{
        const db=r.result,tx=db.transaction(['projects','images'],'readwrite');
        tx.objectStore('projects').put([project],'all');tx.objectStore('images').put(image,'legacy-image');
        tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};
      };
    });
    localStorage.setItem('wb_sf_seeded','1');localStorage.setItem('wb_sf_demo_v9','1');
  },{legacyCache,image});
  await page.goto('/shotflow.html');
  await expect(page.locator('.pcard',{hasText:'升级保留项目'})).toBeVisible();
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).not.toContain('script-src');
  // The app registers the new worker, which precaches the strict artifact and claims the page.
  await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL||''),{timeout:15000}).toMatch(/\/shotflow-sw\.js$/);
  await expect.poll(()=>page.evaluate(async({legacyCache,currentCache})=>{
    const keys=await caches.keys();return keys.includes(currentCache)&&!keys.includes(legacyCache);
  },{legacyCache,currentCache})).toBe(true);
  await page.reload();
  await expect(page.locator('.pcard',{hasText:'升级保留项目'})).toBeVisible();
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toContain("script-src-attr 'none'");
  await page.locator('.pcard',{hasText:'升级保留项目'}).click();
  await page.locator('[data-project-tab="mood"]').click();
  await expect.poll(()=>page.locator('#moodGrid img').first().evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>idb.get('legacy-image'))).toBe(image);
});


test('CSP 委托拒绝无效枚举、未知实体、超长参数和输入法组合回车',async({page})=>{
  await setupV108Project(page);
  const result=await page.evaluate(()=>{
    const before=JSON.stringify(cur());
    const click=(action,args)=>{
      const b=document.createElement('button');b.dataset.do=action;
      args.forEach((a,i)=>b.dataset['a'+i]=JSON.stringify(a));
      document.body.append(b);b.click();b.remove();
    };
    click('toggle-fav',['constructor','shot-a']);
    click('begin-inline-edit',['Shot','missing','']);
    click('switch-project-tab',['constructor']);
    click('open-project',['missing']);
    click('feedback-type',['invalid']);
    const rejected=readActionArgs({dataset:{a0:' '.repeat(2048)+'"shot-a"'}},ACTIONS['del-shot'])===null;
    const input=document.getElementById('s_name');
    input.value='输入法未确认';
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
    return {unchanged:JSON.stringify(cur())===before,tab:view.tab,editing:view.editingShotEditId,rejected};
  });
  expect(result).toEqual({unchanged:true,tab:'shots',editing:null,rejected:true});
  await page.locator('#s_name').fill('正常提交');
  await page.locator('#s_name').press('Enter');
  await expect(page.locator('.shot').filter({hasText:'正常提交'})).toBeVisible();
});

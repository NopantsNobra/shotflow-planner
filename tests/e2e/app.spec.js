/* E2E 关键路径测试：覆盖审核报告中纯函数测试无法触达的渲染层 / DOM 交互层。
   用法：npm run test:e2e（Playwright 自动启动 tests/e2e/static-server.mjs）
   覆盖：① 新建项目→加分镜→排程→导出文档 完整链路
        ② FB-1 渲染层回归：输入分镜名后触发重绘，输入内容不丢失
        ③ P0 持久化：页面隐藏时冲刷未落盘数据 */
import { test, expect } from '@playwright/test';

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
  await expect(page.locator('#settingsBody')).toContainText('v10.7.0');
  await expect(page.locator('#settingsBody')).toContainText('shotflow-v10-11');
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
  const posts = [];
  await page.route('https://api.web3forms.com/submit', async (route) => {
    posts.push({ method: route.request().method(), json: route.request().postDataJSON() });
    if (posts.length === 1) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    } else {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    }
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFreshApp(page);
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  // 环境信息预览在折叠 details 内：先展开再断言内容（构建注入的版本号）
  await page.locator('#settingsBody summary', { hasText: '环境信息' }).click();
  await expect(page.locator('#fbEnvPreview')).toContainText('版本：v10.7.0');
  // 空标题提交被拦截（不发请求）
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('请先填写反馈标题');
  expect(posts.length).toBe(0);
  // 成功路径：POST 负载语义 + 成功提示 + 页面不跳转 + 表单清空
  await page.locator('#fbTitle').fill('测试反馈标题');
  await page.locator('#fbBody').fill('描述内容');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('反馈已提交，感谢！');
  expect(posts.length).toBe(1);
  const first = posts[0];
  expect(first.method).toBe('POST');
  expect(first.json.access_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(first.json.subject).toBe('[Bug] 测试反馈标题');
  expect(first.json.from_name).toBe('瞬刻摄影工作台');
  expect(first.json.message).toContain('描述内容');
  expect(first.json.message).toContain('---');
  expect(first.json.message).toContain('版本：v10.7.0');
  expect(page.url()).toContain('shotflow.html');
  expect(await page.inputValue('#fbTitle')).toBe('');
  // 失败路径：500 → 降级提示，不抛异常、不跳转
  await page.locator('#fbTitle').fill('失败反馈');
  await page.locator('#fbBody').fill('内容');
  await page.getByRole('button', { name: '提交反馈' }).click();
  await expect(page.locator('.toast')).toContainText('提交失败，请使用「复制反馈内容」');
  expect(posts.length).toBe(2);
  // 复制兜底 + 隐私文案（提到 Web3Forms，且不再出现 GitHub / 旧邮件方案字样）
  await expect(page.getByRole('button', { name: '复制反馈内容' })).toBeVisible();
  await page.getByRole('button', { name: '复制反馈内容' }).click();
  await expect(page.locator('.toast')).toContainText('已复制反馈内容');
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
  await expect(modal).toContainText('数据全部保存在本地浏览器（IndexedDB），离线可用');
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

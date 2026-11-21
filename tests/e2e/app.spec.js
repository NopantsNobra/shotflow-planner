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
  expect(await page.locator('#docBody').innerText()).toContain('服务报价');

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

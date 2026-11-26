import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const DEFAULT_PROMPT = readFileSync(
  new URL('../../docs/agent-tasks/generate-shoot-plan-v3.md', import.meta.url),
  'utf8'
).replace(/\r\n/g, '\n').trim();
const PROMPT_KEY = 'wb_sf_agent_prompt_v1';

async function openEditor(page) {
  await page.goto('/shotflow.html');
  await expect(page.locator('.masthead h1')).toHaveText('瞬刻摄影工作台');
  await page.getByRole('button', { name: '⚙ 设置' }).click();
  await page.getByRole('button', { name: '审查与修改提示词' }).click();
  await expect(page.locator('#agentPromptModal')).toHaveClass(/show/);
}

test('Agent 提示词编辑器：默认值、本机保存、复制、恢复与未保存提醒', async ({ page }) => {
  await openEditor(page);
  const field = page.locator('#agentPromptText');
  await expect(field).toHaveValue(DEFAULT_PROMPT);
  expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBeNull();

  const customPrompt = DEFAULT_PROMPT + '\n\nE2E 自定义内容';
  await field.fill(customPrompt);
  await expect(page.locator('#agentPromptStatus')).toHaveText('有未保存的修改');
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmModal')).toHaveClass(/show/);
  await expect(page.locator('#confirmDesc')).toContainText('尚未保存');
  await page.locator('#confirmModal').getByRole('button', { name: '取消' }).click();
  await expect(page.locator('#agentPromptModal')).toHaveClass(/show/);

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.__copiedPrompt = value; } }
    });
  });
  await page.getByRole('button', { name: '保存到本机' }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBe(customPrompt);
  await page.getByRole('button', { name: '复制当前内容' }).click();
  expect(await page.evaluate(() => window.__copiedPrompt)).toBe(customPrompt);
  await expect(page.locator('#agentPromptStatus')).toContainText('已复制');

  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(field).toHaveValue(DEFAULT_PROMPT);
  expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBe(DEFAULT_PROMPT);
  await page.locator('#agentPromptModal').getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '审查与修改提示词' }).click();
  await expect(field).toHaveValue(DEFAULT_PROMPT);
  await page.keyboard.press('Escape');
  await expect(page.locator('#agentPromptModal')).not.toHaveClass(/show/);
  await expect(page.locator('#settingsModal')).toHaveClass(/show/);
});

test('Agent 提示词编辑器：本机存储不可用时保留编辑内容并显示原因', async ({ page }) => {
  await openEditor(page);
  const customPrompt = DEFAULT_PROMPT + '\n\nStorage failure test';
  await page.locator('#agentPromptText').fill(customPrompt);
  await page.evaluate((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('storage disabled', 'SecurityError');
      return setItem.call(this, name, value);
    };
  }, PROMPT_KEY);
  await page.getByRole('button', { name: '保存到本机' }).click();
  await expect(page.locator('#agentPromptStatus')).toContainText('本机存储不可用');
  await expect(page.locator('#agentPromptText')).toHaveValue(customPrompt);
  expect(await page.evaluate((key) => localStorage.getItem(key), PROMPT_KEY)).toBeNull();
});

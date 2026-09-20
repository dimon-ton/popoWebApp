import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const styles = fs.readFileSync(path.join(__dirname, '..', 'src', '_styles.html'), 'utf8');
const start = styles.indexOf('// Keep the page inactive while a button-triggered Apps Script request is running.');
const end = styles.indexOf('function btnLoading(', start);
const busyScript = styles.slice(start, end);
const cssStart = styles.indexOf('.app-action-loading {');
const cssEnd = styles.indexOf('\n', styles.indexOf('@media (prefers-reduced-motion: reduce) { .app-action-loading__spinner', cssStart));
const busyCss = styles.slice(cssStart, cssEnd);

test.use({ storageState: { cookies: [], origins: [] } });

test('button server calls block the page until success or failure', async ({ page }) => {
  await page.setContent('<button id="save">Save</button><button id="local">Local action</button>');
  await page.addStyleTag({ content: busyCss });
  await page.evaluate(() => {
    const state = window as any;
    state.pendingCalls = [];
    state.localClicks = 0;
    function runner(handlers: Record<string, Function>) {
      return {
        withSuccessHandler(callback: Function) { return runner({ ...handlers, success: callback }); },
        withFailureHandler(callback: Function) { return runner({ ...handlers, failure: callback }); },
        save() { state.pendingCalls.push(handlers); },
      };
    }
    state.google = { script: { run: runner({}) } };
    document.getElementById('save')!.onclick = () => state.google.script.run
      .withSuccessHandler(() => {})
      .withFailureHandler(() => {})
      .save();
    document.getElementById('local')!.onclick = () => { state.localClicks++; };
  });
  await page.addScriptTag({ content: busyScript });

  await page.click('#local');
  await expect(page.locator('#appActionLoading')).toHaveCount(0);
  await page.click('#save');
  await expect(page.locator('#appActionLoading')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#local').click({ timeout: 300 })).rejects.toThrow();
  expect(await page.evaluate(() => (window as any).localClicks)).toBe(1);
  await page.evaluate(() => (window as any).pendingCalls.shift().success());
  await expect(page.locator('#appActionLoading')).toHaveCount(0);

  await page.click('#save');
  await expect(page.locator('#appActionLoading')).toBeVisible();
  await page.evaluate(() => (window as any).pendingCalls.shift().failure(new Error('Failed')));
  await expect(page.locator('#appActionLoading')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('aria-busy', 'true');
});

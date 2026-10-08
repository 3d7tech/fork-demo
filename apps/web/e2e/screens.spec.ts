import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function noHorizontalScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, 'page scrolls sideways at 360px').toBeLessThanOrEqual(client);
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('every screen state is accessible and fits a 360px phone', async ({ page }) => {
  await page.goto('/preview');
  await expect(page.getByRole('heading', { name: 'Should you switch to salary sacrifice?' }).first()).toBeVisible();
  await noHorizontalScroll(page);
  await expectAccessible(page);
});

test('ask a question and get the salary sacrifice screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch the pension to salary sacrifice/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Should you switch to salary sacrifice?' })).toBeVisible();
  const verdict = page.getByRole('heading', { level: 2 });
  await expect(verdict).toHaveText('Switch. You take home £128 more a year, and Larkfield adds £120 to your pension.');

  // "How this was worked out" is collapsed by default.
  await expect(page.locator('details.fk-method')).not.toHaveAttribute('open', '');
  await noHorizontalScroll(page);
  await expectAccessible(page);
});

test('answering a question that changes the advice updates the verdict and flags it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch the pension to salary sacrifice/ }).click();
  const mortgage = page.getByRole('group', { name: /Applying for a mortgage/ });
  await mortgage.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Probably switch, but check one thing first.');
  await expect(mortgage.getByText('Changes the answer')).toBeVisible();
  await expect(mortgage.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
});

test('the lever works from the keyboard and the numbers follow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch the pension to salary sacrifice/ }).click();
  const slider = page.getByRole('slider', { name: 'Your pension contribution' });
  await expect(slider).toHaveAttribute('aria-valuetext', '5%');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '6%');
  // 6% of £32,000 is £1,920; the engine's figures replace the old ones once the words are rewritten.
  await expect(page.getByRole('heading', { level: 2 })).not.toContainText('£128');
  await expect(page.getByText('Your pension gets the same £1,920 either way.', { exact: false })).toBeVisible();
});

test('the action confirms what happens next', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch the pension to salary sacrifice/ }).click();
  await page.getByRole('button', { name: 'Switch me to salary sacrifice' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request ready for your accountant' })).toBeVisible();
});

test('a question that is not a decision gets a plain answer, not a screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'where is my p60 lol' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('That’s not a decision, so no screen needed');
  await expect(page.getByRole('slider')).toHaveCount(0);
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SHOTS = process.env.FORK_SCREENSHOTS;

async function check(page: Page, shot?: string) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(scroll, 'page scrolls sideways at 360px').toBeLessThanOrEqual(client);
  // Contrast is measured on the settled screen, not part-way through an entry animation.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  if (SHOTS && shot) await page.screenshot({ path: join(SHOTS, `${shot}.png`), fullPage: true });
}

/** The newest link in the development outbox sent to this address. */
async function linkFromOutbox(page: Page, to: string): Promise<string> {
  await page.goto('/dev/outbox');
  const mail = page.locator('article.mail', { hasText: `To ${to}` }).first();
  return (await mail.locator('a').first().getAttribute('href'))!;
}

test('an owner sets up Larkfield and an employee asks their first question', async ({ page, browser }) => {
  // Signed out, the app asks you to sign in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin$/);
  await check(page, 'setup-1-signin');

  await page.getByLabel('Work email').fill('maya.collins@larkfield.test');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toContainText('sign-in link is on its way');

  // An unknown address gets exactly the same reply.
  await page.getByLabel('Work email').fill('nobody@example.test');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toContainText('sign-in link is on its way');

  await page.goto(await linkFromOutbox(page, 'maya.collins@larkfield.test'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up Fork for Larkfield' })).toBeVisible();
  await expect(page.getByText('5 of 5 steps to go')).toBeVisible();
  await check(page, 'setup-2-checklist');

  // Company settings.
  await page.getByRole('link', { name: /Company settings/ }).click();
  await page.getByLabel(/Share of your NI saving/).fill('50');
  await page.getByLabel('The company claims Employment Allowance').check();
  await check(page, 'setup-3-company');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Company settings saved.');

  // Pension scheme.
  await page.getByRole('link', { name: /Pension scheme/ }).click();
  await page.getByLabel('Scheme name').fill('Larkfield Group Pension');
  await page.getByLabel('Provider (optional)').fill('Nest');
  await check(page, 'setup-4-scheme');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status')).toHaveText('Pension scheme saved.');

  // Payroll: upload, check the suggested columns, import.
  await page.getByRole('link', { name: /Payroll export/ }).click();
  await page.getByLabel('Payroll file').setInputFiles(join(import.meta.dirname, '../../../packages/setup/fixtures/larkfield-payroll.csv'));
  await check(page);
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByRole('heading', { name: 'Check the columns' })).toBeVisible();
  await expect(page.getByLabel(/^Annual salary/)).toHaveValue('Basic Salary (£)');
  await expect(page.getByLabel(/^Contracted hours a week/)).toHaveValue('Contracted Hours');
  await page.getByLabel(/Pay period this export is for/).fill('2026-09-30');
  await check(page, 'setup-5-columns');
  await page.getByRole('button', { name: 'Check and import 34 people' }).click();

  // Team: everyone is ready to invite.
  await expect(page.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await expect(page.getByText('Imported 34 people.')).toBeVisible();
  await check(page, 'setup-6-team');
  await page.getByRole('button', { name: 'Invite Ella Brooks' }).click();
  await expect(page.getByText('Invite sent.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ella Brooks' }).getByText('Invited')).toBeVisible();

  // Documents: Fork reads them (in demo mode there's no model, so the owner types details in).
  await page.goto('/setup/documents');
  await page.getByLabel('What is it?').selectOption('pension_scheme');
  await page.getByLabel('Document (PDF or Word)').setInputFiles(join(import.meta.dirname, '../../../packages/setup/fixtures/larkfield-pension-scheme.pdf'));
  await check(page);
  await page.getByRole('button', { name: 'Upload and read' }).click();
  await expect(page.getByRole('heading', { name: 'larkfield-pension-scheme.pdf' })).toBeVisible();
  await check(page, process.env.FORK_E2E_LIVE ? 'setup-6b-document-facts' : undefined);
  if (process.env.FORK_E2E_LIVE) {
    await expect(page.getByRole('heading', { name: /Employer contribution/ })).toBeVisible();
    const all = page.getByRole('button', { name: /Confirm all/ });
    if (await all.count()) await all.click();
    else await page.getByRole('button', { name: 'Confirm' }).first().click();
  }

  await page.goto('/setup');
  await expect(page.getByText('Setup is done.')).toBeVisible();
  await check(page, 'setup-7-done');

  // The owner adds their accountant, who joins from the emailed invite.
  await page.goto('/setup/team');
  await page.getByLabel('Accountant’s email').fill('books@bureau.test');
  await page.getByRole('button', { name: 'Send accountant invite' }).click();
  await expect(page.getByText('Invite sent.')).toBeVisible();
  const accountantInvite = await linkFromOutbox(page, 'books@bureau.test');
  const accContext = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, locale: 'en-GB' });
  const acc = await accContext.newPage();
  await acc.goto(accountantInvite);
  await acc.getByRole('button', { name: 'Join Larkfield' }).click();
  await expect(acc).toHaveURL(/\/accountant$/);
  await expect(acc.getByText('Nothing open.')).toBeVisible();

  // With payroll in, the owner's home is asking Fork. Company decisions use every salary.
  await page.goto('/');
  await page.getByRole('button', { name: 'Should we introduce salary sacrifice for pensions?' }).click();
  // Titles are written by the model in live runs; the visual's title is written by code.
  await expect(page.locator('figure').getByText('Where the employer NI saving goes each year')).toBeVisible();
  await check(page, 'step7-owner-introduce');
  await page.getByRole('textbox', { name: 'What do you want to work out?' }).fill('What does hiring someone really cost us?');
  await page.getByRole('button', { name: 'Ask Fork' }).click();
  await expect(page.locator('figure').getByText('What the hire costs a year')).toBeVisible();
  await check(page, 'step7-owner-hire');
  await page.getByRole('textbox', { name: 'What do you want to work out?' }).fill('Should we move everyone to a four-day week?');
  await page.getByRole('button', { name: 'Ask Fork' }).click();
  await expect(page.getByRole('heading', { name: 'Fork can’t answer that one yet' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'A bonus as cash or into pensions' })).toBeVisible();
  await check(page, 'step7-not-yet');

  // Ella, in her own browser, accepts the invite and asks about salary sacrifice.
  const invite = await linkFromOutbox(page, 'ella.brooks@larkfield.test');
  const ellaContext = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, locale: 'en-GB' });
  const ella = await ellaContext.newPage();
  await ella.goto(invite);
  await expect(ella.getByRole('heading', { name: 'Join Larkfield on Fork' })).toBeVisible();
  await expect(ella.getByText('Larkfield never sees your questions')).toBeVisible();
  await check(ella, 'setup-8-invite');
  await ella.getByRole('button', { name: 'Join Larkfield' }).click();
  await expect(ella).toHaveURL(/\/$/);
  await expect(ella.getByText('Ella Brooks')).toBeVisible();

  // Ella can't reach the owner's setup pages.
  await ella.goto('/setup/team');
  await expect(ella).toHaveURL(/\/$/);

  await ella.getByRole('button', { name: /switch the pension to salary sacrifice/ }).click();
  await expect(ella.getByRole('heading', { level: 1, name: 'Should you switch to salary sacrifice?' })).toBeVisible();
  // Her numbers came from the imported payroll and the saved scheme and settings.
  await expect(ella.getByRole('heading', { level: 2 })).toContainText('£128');
  await check(ella, 'setup-9-ella-answer');

  await ella.getByRole('textbox', { name: 'What do you want to work out?' }).fill('should I pay more into my pension?');
  await ella.getByRole('button', { name: 'Ask Fork' }).click();
  await expect(ella.locator('figure').getByRole('heading', { name: 'Into your pension a year' })).toBeVisible();
  await expect(ella.getByText('80p').first()).toBeVisible();
  await check(ella, 'step7-ella-contribution');

  // Ella sends her salary sacrifice request to the accountant and saves the decision.
  await ella.getByRole('textbox', { name: 'What do you want to work out?' }).fill('should I switch my pension to salary sacrifice?');
  await ella.getByRole('button', { name: 'Ask Fork' }).click();
  await expect(ella.locator('figure').getByRole('heading', { name: 'Your take-home pay a year' })).toBeVisible();
  await ella.getByRole('button', { name: 'Save and tell me if this changes' }).click();
  await expect(ella.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await ella.locator('.fk-action button.fk-primary').click();
  await expect(ella.getByRole('status').filter({ hasText: 'Sent to your accountant' })).toBeVisible();
  await ella.goto('/decisions');
  await expect(ella.getByText('Private to you. Larkfield never sees these.')).toBeVisible();
  await expect(ella.getByText('Sent to your accountant')).toBeVisible();
  await check(ella, 'step8-ella-decisions');

  // The accountant sees what to change, and marks it done; Ella is told.
  await acc.goto('/accountant');
  await expect(acc.getByText(/Please switch Ella Brooks \(payroll LA104\)/)).toBeVisible();
  await check(acc, 'step8-accountant');
  await acc.getByLabel('Note for them (optional)').fill('Done from the October payroll.');
  await acc.getByLabel('Done').check();
  await acc.getByRole('button', { name: 'Update' }).click();
  await expect(acc.getByText('Nothing open.')).toBeVisible();
  await ella.reload();
  await expect(ella.getByText('Accountant: Done from the October payroll.')).toBeVisible();
  await accContext.close();

  // Ella's own data: download and delete.
  await ella.goto('/me');
  await check(ella);
  const download = await Promise.all([ella.waitForEvent('download'), ella.getByRole('link', { name: 'Download my data' }).click()]);
  expect(download[0].suggestedFilename()).toBe('my-fork-data.json');
  await ellaContext.close();

  // The owner's dashboard: counts only, and nothing about Ella.
  await page.goto('/dashboard');
  await expect(page.getByText('Fewer than 5')).toBeVisible();
  await expect(page.getByText('No topic has reached 5 people yet.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Ella');
  await check(page, 'step8-owner-dashboard');
});

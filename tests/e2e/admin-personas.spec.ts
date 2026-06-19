import { test, expect } from '@playwright/test';

// E2E for the H4 admin click-editor. The editor (built into dist/, served by
// `npm run preview`) calls the SAME-ORIGIN path /agentfirm-api/* which in prod the
// CF tunnel routes to the agentfirm shop-api (:33400). Here we proxy that path to
// the live local API via page.route — so this exercises the REAL editor JS against
// the REAL config DB, without needing CF Access.
const API = 'http://127.0.0.1:33400';
const APP = 'http://localhost:4321/admin/personas/';

test.beforeEach(async ({ page }) => {
  // These tests need the live agentfirm shop-api on :33400 (local/staging).
  // In CI (no backend) skip rather than fail.
  let up = false;
  try {
    up = (await fetch(`${API}/agentfirm-api/healthz`)).ok;
  } catch {
    up = false;
  }
  test.skip(!up, 'agentfirm shop-api (:33400) not reachable — skipping live E2E');

  await page.route('**/agentfirm-api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const resp = await fetch(API + url.pathname + url.search, {
      method: req.method(),
      headers: req.headers(),
      body: ['GET', 'HEAD'].includes(req.method()) ? undefined : (req.postData() ?? undefined),
    });
    await route.fulfill({
      status: resp.status,
      contentType: resp.headers.get('content-type') ?? 'application/json',
      body: await resp.text(),
    });
  });
});

test('admin editor loads the 19 personas from the live config API', async ({ page }) => {
  await page.goto(APP);
  // No load error
  await expect(page.getByText('Fehler:')).toHaveCount(0);
  // Known personas render in the list
  await expect(page.getByRole('button', { name: 'ot-expert', exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('button', { name: 'valerie', exact: true })).toBeVisible();
  // Full roster present (>=19)
  const items = page.locator('ul li button');
  await expect.poll(async () => items.count(), { timeout: 15000 }).toBeGreaterThanOrEqual(19);
  await page.screenshot({ path: 'test-results/admin-personas-list.png', fullPage: true });
});

test('selecting ot-expert loads its full config (edit tabs populate)', async ({ page }) => {
  await page.goto(APP);
  await page.getByRole('button', { name: 'ot-expert', exact: true }).click();
  // The editor should show ot-expert's display name "Olaf" somewhere once loaded
  await expect(page.getByText('Olaf', { exact: false }).first()).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: 'test-results/admin-ot-expert-detail.png', fullPage: true });
});

test('create → save round-trips to the config DB (full UI write path)', async ({ page }) => {
  const KEY = '__e2e__test';
  const del = () =>
    fetch(`${API}/agentfirm-api/personas/${KEY}`, { method: 'DELETE' }).catch(() => {});
  await del(); // clean slate
  try {
    await page.goto(APP);
    await page.getByRole('button', { name: '+ Neu' }).click();
    await page.getByPlaceholder('persona-key', { exact: false }).fill(KEY);
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click();
    // appears in the live list (came back from the API after the PUT)
    await expect(page.getByRole('button', { name: KEY, exact: true })).toBeVisible({
      timeout: 15000,
    });
    // persisted in the config DB — verified out-of-band against the API
    const resp = await fetch(`${API}/agentfirm-api/personas/${KEY}`);
    expect(resp.status).toBe(200);
    expect((await resp.json()).key).toBe(KEY);
  } finally {
    await del(); // cleanup — never leave the throwaway persona behind
  }
});

import { test, expect, type Page } from '@playwright/test';

/**
 * P86.5 — Persona-Approval-Management UI on the persona detail page.
 *
 * The "Freigaben" + "Verlauf" surface reads the per-tenant bearer from the
 * onboarding wizard state (localStorage) and talks to the personas-api proxy
 * (mocked here). DailyDoing's public hermes call is stubbed so the page is
 * network-isolated.
 */

const MOCK = {
  tenantId: 't_testid12345',
  token: 'pommer_testtoken',
};

const WIZARD_STATE = {
  tenantId: MOCK.tenantId,
  token: MOCK.token,
  company: 'Test GmbH',
  branche: 'J',
  selectedPersonas: ['helga'],
};

const MATRIX = {
  persona: 'helga',
  tools: [
    {
      tool: 'm365_send_email',
      mode: 'ask',
      always: 'require_approval',
      match_arg: null,
      trusted_patterns: [],
      on_mismatch: null,
      source: 'default',
    },
    {
      tool: 'delete_event',
      mode: 'deny',
      always: 'deny',
      match_arg: null,
      trusted_patterns: [],
      on_mismatch: null,
      source: 'bundle',
    },
    {
      tool: 'batch_delete_emails',
      mode: 'allow',
      always: 'allow',
      match_arg: null,
      trusted_patterns: [],
      on_mismatch: null,
      source: 'bundle',
    },
  ],
};

const HISTORY = {
  persona: 'helga',
  total: 2,
  limit: 50,
  offset: 0,
  entries: [
    { kind: 'gate_decision', tool: 'm365_send_email', decision: 'deny', at: '2026-06-18T09:00:00Z', by: 'gate' },
    { kind: 'policy_change', tool: 'delete_event', at: '2026-06-18T08:30:00Z', by: 'tenant' },
  ],
  audit_enabled: true,
  live_grants: [
    { scope: 'session', tool: 'm365_send_email', conversation_id: 'c_1', ttl_seconds: 1800 },
  ],
};

/** Stub the public DailyDoing endpoint + inject wizard state before first load. */
async function setup(page: Page, opts: { withSession?: boolean } = {}) {
  await page.route('**/public/personas/**/activity', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ persona: 'helga', self_improvement: null, self_scheduled_tasks: { count: 0, cap: 5, tasks: [] } }) }),
  );
  if (opts.withSession !== false) {
    await page.addInitScript((s) => {
      localStorage.setItem('pommer_wizard_state', JSON.stringify(s));
    }, WIZARD_STATE);
  }
}

/** Register approval-API routes. PUT bodies are captured into `puts`. */
async function mockApprovals(page: Page, puts: Array<{ tool: string; body: unknown }>) {
  await page.route('**/personas/helga/approvals', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MATRIX) }),
  );
  // PUT /approvals/{tool} — also catches /approvals/history glob-wise, so we
  // branch on method and let non-PUT fall through to the history route below.
  await page.route('**/personas/helga/approvals/*', async (r) => {
    if (r.request().method() !== 'PUT') return r.fallback();
    const tool = r.request().url().split('/').pop()!.split('?')[0];
    puts.push({ tool, body: r.request().postDataJSON() });
    const orig = MATRIX.tools.find((t) => t.tool === tool)!;
    const body = r.request().postDataJSON() as { mode: string };
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...orig, mode: body.mode, source: 'bundle' }),
    });
  });
  // History registered last → wins for the /approvals/history URL.
  await page.route('**/personas/helga/approvals/history**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HISTORY) }),
  );
}

test('no tenant session → shows onboarding hint, no matrix', async ({ page }) => {
  await setup(page, { withSession: false });
  await page.goto('/personas/helga');

  await expect(page.getByText(/setzt eine aktive Tenant-Sitzung voraus/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /Onboarding starten/i })).toBeVisible();
});

test('Freigaben tab → renders tool matrix with Allow/Ask/Deny radios', async ({ page }) => {
  const puts: Array<{ tool: string; body: unknown }> = [];
  await setup(page);
  await mockApprovals(page, puts);
  await page.goto('/personas/helga');

  await expect(page.getByText('m365_send_email')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('delete_event')).toBeVisible();

  // Counts: 2 of 3 tools are not on Allow.
  await expect(page.getByText(/2 noch nicht auf Allow/i)).toBeVisible();

  // Each tool row exposes the four radio modes.
  const row = page.locator('li', { hasText: 'm365_send_email' });
  await expect(row.getByRole('radio', { name: 'Allow' })).toBeVisible();
  await expect(row.getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'true');
});

test('changing a tool to Allow → PUT {mode:allow} and optimistic active state', async ({ page }) => {
  const puts: Array<{ tool: string; body: unknown }> = [];
  await setup(page);
  await mockApprovals(page, puts);
  await page.goto('/personas/helga');

  const row = page.locator('li', { hasText: 'm365_send_email' });
  await row.getByRole('radio', { name: 'Allow' }).click();

  await expect.poll(() => puts.find((p) => p.tool === 'm365_send_email')?.body).toEqual({ mode: 'allow' });
  await expect(row.getByRole('radio', { name: 'Allow' })).toHaveAttribute('aria-checked', 'true');
});

test('Persona vor-freigeben → confirm dialog → PUTs all gated tools to allow', async ({ page }) => {
  const puts: Array<{ tool: string; body: unknown }> = [];
  await setup(page);
  await mockApprovals(page, puts);
  await page.goto('/personas/helga');

  await page.getByRole('button', { name: 'Persona vor-freigeben' }).click();

  // Confirm dialog appears with the persona name + count.
  await expect(page.getByRole('heading', { name: /Persona vor-freigeben\?/i })).toBeVisible();
  await page.getByRole('button', { name: 'Alle auf Allow' }).click();

  // Both gated tools (ask + deny) get a PUT mode:allow; the already-allow one does not.
  await expect.poll(() => puts.map((p) => p.tool).sort()).toEqual(['delete_event', 'm365_send_email']);
  expect(puts.every((p) => (p.body as { mode: string }).mode === 'allow')).toBe(true);
});

test('Verlauf tab → renders live grants + decision entries', async ({ page }) => {
  const puts: Array<{ tool: string; body: unknown }> = [];
  await setup(page);
  await mockApprovals(page, puts);
  await page.goto('/personas/helga');

  await page.getByRole('button', { name: 'Verlauf' }).click();

  await expect(page.getByText('Aktive Grants')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Entscheidungen \(2\)/)).toBeVisible();
  await expect(page.getByText('Policy geändert')).toBeVisible();
  // A live grant for m365_send_email is shown with its remaining TTL.
  await expect(page.getByText(/noch 30 min/i)).toBeVisible();
});

test('approvals API error → soft fallback hint with retry', async ({ page }) => {
  await setup(page);
  await page.route('**/personas/helga/approvals', (r) =>
    r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ detail: 'hermes-rest unavailable' }) }),
  );
  await page.goto('/personas/helga');

  await expect(page.getByText(/Freigaben nicht abrufbar/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'erneut' })).toBeVisible();
});

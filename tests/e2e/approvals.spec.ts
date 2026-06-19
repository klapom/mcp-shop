import { test, expect, type Page } from '@playwright/test';

/**
 * P86 — Persona-Approval-Management UI on the persona detail page.
 *
 * Auth is the gateway JWT from the in-browser OAuth-PKCE login, kept in
 * localStorage ('pommer_gw_token'). The approvals calls hit the gateway BFF
 * (GATEWAY_BASE/approvals/...), mocked here. DailyDoing's public hermes call is
 * stubbed so the page is network-isolated.
 */

const FAKE_JWT = 'header.payload.sig'; // shape doesn't matter — gateway is mocked

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

/** Stub DailyDoing's public endpoint + inject a gateway token before first load. */
async function setup(page: Page, opts: { withToken?: boolean } = {}) {
  await page.route('**/public/personas/**/activity', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ persona: 'helga', self_improvement: null, self_scheduled_tasks: { count: 0, cap: 5, tasks: [] } }) }),
  );
  if (opts.withToken !== false) {
    await page.addInitScript((t) => {
      localStorage.setItem('pommer_gw_token', t);
    }, FAKE_JWT);
  }
}

/** Register gateway approvals-BFF routes. PUT bodies are captured into `puts`. */
async function mockApprovals(page: Page, puts: Array<{ tool: string; body: unknown }>) {
  await page.route('**/approvals/personas/helga', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MATRIX) }),
  );
  await page.route('**/approvals/personas/helga/tools/*', async (r) => {
    const tool = r.request().url().split('/').pop()!.split('?')[0];
    const body = r.request().postDataJSON() as { mode: string };
    puts.push({ tool, body });
    // Realistic hermes PUT response shape — note: NO `mode` field (the applied
    // policy is under `applied`). The UI must keep its optimistic row state and
    // not render from this, or the row loses its selection.
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        persona: 'helga',
        tool,
        applied: { always: body.mode },
        previous: null,
        by: 'pommer-admin',
        reloaded: true,
      }),
    });
  });
  await page.route('**/approvals/personas/helga/history**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HISTORY) }),
  );
}

test('no gateway session → shows Anmelden button, no matrix', async ({ page }) => {
  await setup(page, { withToken: false });
  await page.goto('/personas/helga');

  await expect(page.getByText(/mit deinem Pommer-Konto anmelden/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Anmelden$/i })).toBeVisible();
});

test('Freigaben tab → renders tool matrix with Allow/Ask/Deny radios', async ({ page }) => {
  const puts: Array<{ tool: string; body: unknown }> = [];
  await setup(page);
  await mockApprovals(page, puts);
  await page.goto('/personas/helga');

  await expect(page.getByText('m365_send_email')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('delete_event')).toBeVisible();
  await expect(page.getByText(/2 noch nicht auf Allow/i)).toBeVisible();

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
  await expect(page.getByRole('heading', { name: /Persona vor-freigeben\?/i })).toBeVisible();
  await page.getByRole('button', { name: 'Alle auf Allow' }).click();

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
  await expect(page.getByText(/noch 30 min/i)).toBeVisible();
});

test('approvals API error → soft fallback hint with retry', async ({ page }) => {
  await setup(page);
  await page.route('**/approvals/personas/helga', (r) =>
    r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'hermes_rest_unavailable' }) }),
  );
  await page.goto('/personas/helga');

  await expect(page.getByText(/Freigaben nicht abrufbar/i)).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'erneut' })).toBeVisible();
});

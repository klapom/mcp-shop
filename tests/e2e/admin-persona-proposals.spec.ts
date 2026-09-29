import { test, expect, type Page, type Route } from '@playwright/test';

// H10.13b/T44 — Admin-Tab „Persona-Entwürfe".
// Die echte API (/agentfirm-api/persona-proposals) braucht ein CF-Access-JWT; sie wird hier
// per page.route GEMOCKT (Vertrag laut Auftrag). Der Mock protokolliert jeden Request.

const APP = '/admin/persona-proposals/';

const MD = [
  '# Stellenbeschreibung',
  '',
  'Erste **wichtige** Zeile mit `code`.',
  '',
  '- Punkt A',
  '- Punkt B',
  '',
  '<script>window.__xss = 1</script>',
  '<img src=x onerror="window.__xss2 = 1">',
  '[böse](javascript:window.__xss3=1)',
].join('\n');

function fixtures() {
  const list: Record<string, any> = {
    'infra-agent': {
      key: 'infra-agent', display_name: 'Infra Agent', state: 'new', owner: 'helga',
      created: '2026-09-28T10:00:00Z', wertstrom: 'it', stream_lead: 'helga', skills: ['deploy-helper', 'log-reader'],
    },
    'alt-persona': {
      key: 'alt-persona', display_name: 'Alt Persona', state: 'adopted', owner: 'helga',
      created: '2026-09-20T10:00:00Z', wertstrom: 'hr', stream_lead: '', skills: [],
    },
    'abgelehnt-persona': {
      key: 'abgelehnt-persona', display_name: 'Abgelehnt Persona', state: 'rejected', owner: 'helga',
      created: '2026-09-25T10:00:00Z', wertstrom: 'hr', stream_lead: '', skills: ['x'],
    },
  };
  return list;
}

type Recorded = { method: string; path: string; body: any };

async function mockApi(page: Page, opts: { adopt?: { status: number; body: unknown } } = {}) {
  const items = fixtures();
  const calls: Recorded[] = [];
  await page.route('**/agentfirm-api/persona-proposals**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const rest = url.pathname.replace(/^.*\/agentfirm-api\/persona-proposals/, '');
    const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
    let body: any = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    calls.push({ method: req.method(), path: url.pathname, body });
    const json = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

    if (parts.length === 0) return json(200, Object.values(items));
    const it = items[parts[0]];
    if (!it) return json(404, { detail: 'nicht gefunden' });
    if (parts.length === 1) {
      return json(200, {
        key: it.key,
        meta: { state: it.state, owner: it.owner, created: it.created,
          ...(it.state === 'rejected' ? { rejected_at: '2026-09-26T08:00:00Z', reason: 'doppelt vorhanden' } : {}),
          ...(it.state === 'adopted' ? { adopted_at: '2026-09-27T08:00:00Z' } : {}) },
        draft: { key: it.key, display_name: it.display_name, identity_prose: 'Ich bin Infra.',
          wertstrom: it.wertstrom, stream_lead: it.stream_lead, skills: it.skills, rationale: 'weil' },
        stellenbeschreibung_md: MD,
      });
    }
    if (parts[1] === 'adopt') {
      const r = opts.adopt ?? { status: 200, body: { key: it.key, state: 'adopted' } };
      if (r.status === 200) it.state = 'adopted';
      return json(r.status, r.body);
    }
    if (parts[1] === 'reject') { it.state = 'rejected'; return json(200, { key: it.key, state: 'rejected' }); }
    return json(405, { detail: 'mock' });
  });
  return { calls };
}

const mutating = (c: Recorded[]) => c.filter((x) => x.method !== 'GET');

test('Liste rendert Zeilen mit Zustands-Badges, neueste zuerst', async ({ page }) => {
  await mockApi(page);
  await page.goto(APP);
  const rows = page.getByTestId(/^pp-row-/);
  await expect(rows).toHaveCount(3);
  // created desc: infra-agent (09-28), abgelehnt-persona (09-25), alt-persona (09-20)
  await expect(rows.nth(0)).toHaveAttribute('data-testid', 'pp-row-infra-agent');
  await expect(rows.nth(2)).toHaveAttribute('data-testid', 'pp-row-alt-persona');
  const first = page.getByTestId('pp-row-infra-agent');
  await expect(first).toContainText('Infra Agent');
  await expect(first).toContainText('helga');
  await expect(first).toContainText('it');
  await expect(first).toContainText('deploy-helper');
  await expect(first.getByTestId('state-badge')).toHaveText('neu');
  await expect(page.getByTestId('pp-row-alt-persona').getByTestId('state-badge')).toHaveText('übernommen');
  await expect(page.getByTestId('pp-row-abgelehnt-persona').getByTestId('state-badge')).toHaveText('abgelehnt');
});

test('Deep-Link ?k= öffnet direkt das Detail', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?k=infra-agent`);
  await expect(page.getByTestId('pp-detail-title')).toContainText('infra-agent');
  await expect(page.getByLabel('Anzeigename')).toHaveValue('Infra Agent');
  await expect(page.getByTestId('pp-md')).toContainText('Punkt A');
  await expect(page.getByTestId('pp-md').locator('strong')).toHaveText('wichtige');
});

test('Übernehmen sendet erst nach Bestätigung und mit den editierten Feldern', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?k=infra-agent`);
  await page.getByLabel('Anzeigename').fill('Infra Agent 2');
  await page.getByLabel('Wertstrom').fill('betrieb');
  await page.getByLabel('Skills').fill('a, b ,c');
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  // Dialog offen, noch kein POST
  await expect(page.getByTestId('pp-confirm')).toBeVisible();
  expect(mutating(calls)).toHaveLength(0);
  // Abbrechen sendet nichts
  await page.getByRole('button', { name: 'Abbrechen' }).click();
  expect(mutating(calls)).toHaveLength(0);
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByTestId('pp-confirm').getByRole('button', { name: 'Ja, übernehmen' }).click();
  await expect(page.getByTestId('pp-adopted-note')).toContainText('Persona angelegt. Infrastruktur (Bot/Container) folgt separat');
  const m = mutating(calls);
  expect(m).toHaveLength(1);
  expect(m[0].method).toBe('POST');
  expect(m[0].path).toMatch(/\/persona-proposals\/infra-agent\/adopt$/);
  expect(m[0].body).toMatchObject({
    display_name: 'Infra Agent 2', wertstrom: 'betrieb', identity_prose: 'Ich bin Infra.',
    stream_lead: 'helga', skills: ['a', 'b', 'c'],
  });
});

test('Ablehnen ohne Grund ist blockiert (kein Request), mit Grund wird gesendet', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?k=infra-agent`);
  const btn = page.getByRole('button', { name: 'Ablehnen' });
  await expect(btn).toBeDisabled();
  await page.getByLabel('Grund der Ablehnung').fill('   ');
  await expect(btn).toBeDisabled();
  await btn.click({ force: true });
  expect(mutating(calls)).toHaveLength(0);
  await page.getByLabel('Grund der Ablehnung').fill('doppelt');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect(page.getByTestId('state-badge')).toHaveText('abgelehnt');
  const m = mutating(calls);
  expect(m).toHaveLength(1);
  expect(m[0].path).toMatch(/\/reject$/);
  expect(m[0].body).toEqual({ reason: 'doppelt' });
});

test('API-Fehler 409 beim Übernehmen wird mit Grund angezeigt', async ({ page }) => {
  await mockApi(page, { adopt: { status: 409, body: { detail: 'Key infra-agent existiert bereits' } } });
  await page.goto(`${APP}?k=infra-agent`);
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByTestId('pp-confirm').getByRole('button', { name: 'Ja, übernehmen' }).click();
  await expect(page.getByTestId('pp-adopt-error')).toContainText('Key infra-agent existiert bereits');
  await expect(page.getByTestId('pp-adopt-error')).toContainText('409');
  await expect(page.getByTestId('pp-adopted-note')).toHaveCount(0);
});

test('API-Fehler 422 mit Fehlerliste wird angezeigt', async ({ page }) => {
  await mockApi(page, { adopt: { status: 422, body: { detail: [{ msg: 'skills: ungueltig' }] } } });
  await page.goto(`${APP}?k=infra-agent`);
  await page.getByRole('button', { name: 'Übernehmen' }).click();
  await page.getByTestId('pp-confirm').getByRole('button', { name: 'Ja, übernehmen' }).click();
  await expect(page.getByTestId('pp-adopt-error')).toContainText('skills: ungueltig');
});

for (const [key, badge] of [['alt-persona', 'übernommen'], ['abgelehnt-persona', 'abgelehnt']] as const) {
  test(`${key}: read-only, keine Aktions-Buttons`, async ({ page }) => {
    await mockApi(page);
    await page.goto(`${APP}?k=${key}`);
    await expect(page.getByTestId('state-badge')).toHaveText(badge);
    await expect(page.getByRole('button', { name: 'Übernehmen' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ablehnen' })).toHaveCount(0);
    await expect(page.getByLabel('Anzeigename')).toBeDisabled();
  });
}

test('abgelehnt zeigt den Grund', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?k=abgelehnt-persona`);
  await expect(page.getByTestId('pp-meta')).toContainText('doppelt vorhanden');
});

test('Markdown mit <script>/onerror/javascript: wird nicht ausgeführt', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?k=infra-agent`);
  await expect(page.getByTestId('pp-md')).toContainText('Punkt A');
  const flags = await page.evaluate(() => [
    (window as any).__xss, (window as any).__xss2, (window as any).__xss3,
  ]);
  expect(flags).toEqual([undefined, undefined, undefined]);
  await expect(page.getByTestId('pp-md').locator('script')).toHaveCount(0);
  await expect(page.getByTestId('pp-md').locator('img')).toHaveCount(0);
  await expect(page.getByTestId('pp-md').locator('a[href^="javascript"]')).toHaveCount(0);
  // wörtlich sichtbar als Text
  await expect(page.getByTestId('pp-md')).toContainText('<script>window.__xss = 1</script>');
});

test('AdminNav verlinkt den neuen Tab', async ({ page }) => {
  await mockApi(page);
  await page.goto(APP);
  await expect(page.getByRole('link', { name: 'Persona-Entwürfe' })).toHaveAttribute('href', '/admin/persona-proposals/');
});

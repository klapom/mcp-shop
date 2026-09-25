import { test, expect, type Page, type Route } from '@playwright/test';

// Admin Persona-Editor — Critic-Akzeptanztests 16–21 (Admin-Umbau Schnitt 6).
//
// The real API (/agentfirm-api/*, agentfirm shop-api :33400) requires a Cloudflare-Access
// JWT that does not exist locally/in CI, so it is MOCKED per page.route (same pattern as
// admin-skills.spec.ts). The mock records every request so the tests assert what the UI sent.
// Shapes follow agent-firm-V1 #58–#62 (shop_api/app.py, rollout_api.py).

const APP = '/admin/personas/';

/** The 7 fields removed from PersonaSpec in agent-firm-V1 #60 — must never be sent again. */
const REMOVED = [
  'baseline_ref',
  'track_sovereign',
  'track_microsoft',
  'routing_keywords',
  'footer_signature',
  'tools',
  'mcps',
];

const GATED = [
  'batch_delete_emails',
  'batch_delete_events',
  'delete_contact',
  'delete_email',
  'delete_event',
  'delete_list_item',
  'delete_task',
  'forward_email',
  'lkdin_approve_draft',
  'lkdin_mark_published_draft',
  'reply_email',
  'reply_to_channel_message',
  'respond_to_event',
  'send_channel_message',
  'send_chat_message',
  'send_draft',
  'send_email',
  'share_calendar',
  'share_file',
];

const RUNNING = ['conny', 'ferdinand', 'helga', 'lead-hunter', 'ot-expert', 'skill-smith'];
const FROZEN = [
  'bjoern',
  'cora',
  'mira',
  'finn',
  'greta',
  'hanno',
  'ida',
  'jonas',
  'kai',
  'lena',
  'max',
  'nora',
];
const JUDGES = ['judge-fakten', 'judge-stil'];

function catalog() {
  return {
    groups: [
      { name: 'teams_read', namespace: 'm365', tools: ['m365_list_chats', 'm365_list_chat_messages'], whole_namespace: false, opt_in: false, hold: null, source: null, plugin_tools: [] },
      { name: 'teams_write', namespace: 'm365', tools: ['m365_send_chat_message', 'm365_send_channel_message'], whole_namespace: false, opt_in: true, hold: null, source: null, plugin_tools: [] },
      { name: 'searxng', namespace: 'searxng', tools: [], whole_namespace: true, opt_in: false, hold: null, source: null, plugin_tools: [] },
      {
        name: 'firecrawl',
        namespace: 'firecrawl',
        tools: ['firecrawl_scrape', 'firecrawl_crawl'],
        whole_namespace: false,
        opt_in: false,
        hold: 'LinkedIn-Schutz (http_guard + firecrawl-Denylist, P80) im neuen Stack nicht geprueft',
        source: null,
        plugin_tools: [],
      },
      { name: '_office_skill', namespace: null, tools: [], whole_namespace: false, opt_in: false, hold: null, source: null, plugin_tools: [] },
      { name: '_knowledge', namespace: null, tools: [], whole_namespace: false, opt_in: false, hold: null, source: null, plugin_tools: ['read_knowledge'] },
    ],
    models: [
      { id: 'qwen36-35b', label: 'Nemotron (qwen36-35b)', endpoint: 'http://127.0.0.1:32000/v1', default: true },
      { id: 'qwen3.8-27b-nvfp4', label: 'Qwen3.8 (qwen3.8-27b-nvfp4)', endpoint: 'http://127.0.0.1:32030/v1', default: false },
      { id: 'qwen38-nvfp4', label: 'Qwen3.8 (qwen38-nvfp4)', endpoint: 'http://127.0.0.1:32030/v1', default: false },
    ],
    gated_tools: GATED,
    // deliberately NO skills/mcps/tools keys: the UI must not depend on the deprecated ones
  };
}

function spec(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    display_name: key === 'ot-expert' ? 'Olaf' : key.toUpperCase(),
    identity_prose: `Ich bin ${key}.`,
    model: 'qwen36-35b',
    reasoning: null,
    skills: ['teams_read'],
    wertstrom: 'beratung',
    stream_lead: false,
    approval_policies: {},
    version: '2026-05-07-1',
    knowledge: [],
    ...over,
  };
}

type Recorded = { method: string; path: string; body: any };

interface MockOpts {
  /** extra runtime items (e.g. a stopped persona) */
  extraRuntime?: Record<string, unknown>[];
  /** final rollout outcome after the job ran */
  rolloutEnd?: 'rollout_pending' | 'rolled_out' | 'failed';
  /** answer for PUT (default: echo) */
  put?: (key: string, body: any) => { status: number; body: unknown } | null;
  /** answer for POST …/rollout (default 202) */
  rollout?: (key: string) => { status: number; body: unknown } | null;
}

async function mockApi(page: Page, opts: MockOpts = {}) {
  const calls: Recorded[] = [];
  const specs: Record<string, any> = {
    'ot-expert': spec('ot-expert', {
      reasoning: 'medium',
      skills: ['teams_read', 'searxng'],
      approval_policies: {
        m365_send_email: { always: 'log_only' },
        delete_event: { always: 'require_approval' },
      },
    }),
    'lead-hunter': spec('lead-hunter', { skills: ['searxng', 'firecrawl'] }),
  };
  const runtime: Record<string, any> = {};
  const add = (key: string, status: string, teams_app: boolean) => {
    runtime[key] = {
      key,
      display_name: key,
      status,
      pending: false,
      updated_at: '2026-09-23T11:14:00Z',
      container:
        status === 'frozen'
          ? null
          : { name: `agentfirm-gw-${key}`, state: status === 'running' ? 'running' : 'exited', started_at: '2026-09-25T05:59:45Z' },
      teams_app,
      rollout_state: null,
      job_status: null,
      rollout: { state: null, job: null, rollout_pending: null, last_error: null, rolled_out_at: null, log_tail: '' },
    };
  };
  RUNNING.forEach((k) => add(k, 'running', true));
  FROZEN.forEach((k) => add(k, 'frozen', true));
  JUDGES.forEach((k) => add(k, 'frozen', false));
  for (const x of opts.extraRuntime ?? []) {
    add(x.key as string, x.status as string, (x.teams_app as boolean) ?? true);
  }
  const jobTicks: Record<string, number> = {};

  await page.route('**/agentfirm-api/**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const rest = url.pathname.replace(/^.*\/agentfirm-api/, '');
    const parts = rest.split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method();
    let body: any = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
    calls.push({ method, path: url.pathname, body });
    const json = (status: number, payload: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

    if (rest === '/catalog') return json(200, catalog());
    if (rest === '/runtime') {
      return json(200, {
        personas: Object.values(runtime).map(({ rollout, ...item }) => ({ ...item })),
      });
    }
    if (rest === '/personas') return json(200, { keys: Object.keys(runtime) });

    if (parts[0] === 'personas' && parts[1]) {
      const key = parts[1];
      const r = runtime[key];
      if (!r) return json(404, { detail: `Persona '${key}' not found` });
      const sp = (specs[key] ??= spec(key));
      const action = parts[2];

      if (!action && method === 'GET') return json(200, sp);
      if (!action && method === 'PUT') {
        const custom = opts.put?.(key, body);
        if (custom) return json(custom.status, custom.body);
        const { change_note, ...fields } = body;
        Object.assign(sp, fields);
        if (r.status === 'running') r.pending = true; // updated_at > StartedAt
        return json(200, sp);
      }
      if (action === 'runtime' && method === 'GET') {
        const ro = r.rollout;
        if (ro.job?.status === 'running') {
          jobTicks[key] = (jobTicks[key] ?? 0) + 1;
          if (jobTicks[key] === 1) {
            ro.log_tail = `=== ${key} ===\n⏳ ${key}: laufender Turn — warte (max 600 s) …`;
          } else {
            const end = opts.rolloutEnd ?? 'rollout_pending';
            ro.log_tail += `\n⏳ ${key}: Turn läuft noch …\n⏸ ${key}: Rollout verschoben`;
            ro.state = end;
            ro.job = {
              ...ro.job,
              status: end === 'failed' ? 'failed' : 'done',
              exit_code: end === 'rolled_out' ? 0 : end === 'failed' ? 1 : 6,
              finished_at: '2026-09-25T09:00:00Z',
            };
            if (end === 'rollout_pending') ro.rollout_pending = `Rollout ausstehend: ${key} hat eine laufende Sitzung`;
            if (end === 'failed') ro.last_error = 'rollout.sh: Zusicherung rot';
            if (end === 'rolled_out') {
              ro.rolled_out_at = '2026-09-25T09:00:00Z';
              r.pending = false;
            }
          }
        }
        return json(200, r);
      }
      if (action === 'rollout' && method === 'POST') {
        const custom = opts.rollout?.(key);
        if (custom) return json(custom.status, custom.body);
        if (r.status !== 'running') return json(409, { detail: `${key} ist eingefroren (kein Container) — kein Rollout aus dem Shop` });
        r.rollout = {
          state: 'rolling_out',
          job: { pid: 4242, status: 'running', kind: 'rollout', by: 'klaus.pommer@pommerconsulting.de', started_at: '2026-09-25T08:59:00Z' },
          rollout_pending: null,
          last_error: null,
          rolled_out_at: null,
          log_tail: '',
        };
        return json(202, { state: 'rolling_out', job: r.rollout.job });
      }
      if (action === 'co-personas') return json(200, { co_personas: ['helga'] });
      if (action === 'versions') {
        return json(200, {
          versions: [
            { version: '2026-05-07-1', change_note: 'zweite', created_at: '2026-09-24T10:00:00Z', snapshot: '{"key":"x","n":2}' },
            { version: '2026-05-07-1', change_note: 'erste', created_at: '2026-09-23T10:00:00Z', snapshot: '{"key":"x","n":1}' },
          ],
        });
      }
      if (action === 'avatar') return route.fulfill({ status: 404, body: '' });
      if (action === 'teams-package.zip') {
        if (!r.teams_app) return json(404, { detail: 'kein Manifest' });
        return route.fulfill({
          status: 200,
          contentType: 'application/zip',
          headers: { 'X-Teams-Package-Version': '1.0.3', 'Content-Disposition': `attachment; filename="${key}.zip"` },
          body: Buffer.from('PK\u0003\u0004fake'),
        });
      }
    }
    return json(405, { detail: `mock: ${method} ${rest} nicht vorgesehen` });
  });
  return { calls, specs, runtime };
}

const puts = (calls: Recorded[]) => calls.filter((c) => c.method === 'PUT');

async function open(page: Page, key: string) {
  await page.getByTestId(`persona-${key}`).click();
  await expect(page.getByTestId('save-button')).toBeVisible();
}

// ---------------------------------------------------------------------------
// 16 — list
// ---------------------------------------------------------------------------

test('16 Liste: 6 laufende oben, „Eingefroren (12)“ + „Judges (2)“ eingeklappt, kein Neu/Klonen/Löschen', async ({ page }) => {
  await mockApi(page);
  await page.goto(APP);

  const active = page.getByTestId('list-active');
  await expect(active.getByRole('button')).toHaveCount(6);
  for (const k of RUNNING) {
    await expect(active.getByTestId(`persona-${k}`)).toHaveAttribute('data-status', 'running');
    await expect(active.getByTestId(`persona-${k}`).getByLabel('läuft')).toBeVisible();
  }
  const frozen = page.getByTestId('list-frozen');
  await expect(frozen.locator('summary')).toHaveText('Eingefroren (12)');
  await expect(frozen).not.toHaveAttribute('open', '');
  await expect(frozen.getByTestId('persona-bjoern')).toBeHidden();
  const judges = page.getByTestId('list-judges');
  await expect(judges.locator('summary')).toHaveText('Judges (2)');
  await expect(judges.getByTestId('persona-judge-fakten')).toBeHidden();
  // grey
  await expect(frozen).toHaveClass(/opacity-60/);

  // expand works
  await frozen.locator('summary').click();
  await expect(frozen.getByTestId('persona-bjoern')).toBeVisible();

  // no create / clone / delete — neither before nor after selecting a persona
  for (const name of ['+ Neu', 'Klonen', 'Löschen']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await open(page, 'ot-expert');
  for (const name of ['+ Neu', 'Klonen', 'Löschen']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0);
  }
  await page.screenshot({ path: 'test-results/admin-personas-list.png', fullPage: true });
});

test('16b gestoppte Persona steht oben und ist sichtbar markiert; kein Ausrollen', async ({ page }) => {
  await mockApi(page, { extraRuntime: [{ key: 'bruno', status: 'stopped' }] });
  await page.goto(APP);
  const item = page.getByTestId('list-active').getByTestId('persona-bruno');
  await expect(item).toHaveAttribute('data-status', 'stopped');
  await expect(item.getByTestId('stopped-mark')).toHaveText('gestoppt');
  await item.click();
  await expect(page.getByTestId('status-badge')).toHaveText('gestoppt');
  await expect(page.getByTestId('stopped-hint')).toBeVisible();
  await expect(page.getByTestId('rollout-button')).toHaveCount(0);
});

test('Deep-Link ?persona=bjoern öffnet die Gruppe „Eingefroren“; alter tab=behavior landet in „Team“', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?persona=bjoern&tab=behavior`);
  await expect(page.getByTestId('list-frozen')).toHaveAttribute('open', '');
  await expect(page.getByTestId('tab-stream')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('team-hint')).toContainText('Nur Roster-Info für Helga');
  await expect(page.getByText('P37')).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// 17 — save → pending → Ausrollen
// ---------------------------------------------------------------------------

test('17 Speichern: PUT ohne die 7 entfernten Felder, danach „Änderung ausstehend“ + „Ausrollen“', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(APP);
  await open(page, 'ot-expert');

  await expect(page.getByTestId('save-button')).toHaveText('Speichern');
  await expect(page.getByText('→ live')).toHaveCount(0);
  await expect(page.getByText(/Hot-Reload/i)).toHaveCount(0);
  await expect(page.getByText('Freigaben wirken nach ≤5 min, alles andere nach dem Ausrollen.').first()).toBeVisible();
  await expect(page.getByTestId('pending-badge')).toHaveCount(0);
  await expect(page.getByTestId('rollout-button')).toHaveCount(0);

  await page.getByLabel('Anzeigename').fill('Olaf der Zweite');
  await page.getByTestId('save-button').click();

  await expect.poll(() => puts(calls).length).toBe(1);
  const put = puts(calls)[0];
  expect(put.path).toBe('/agentfirm-api/personas/ot-expert');
  for (const f of REMOVED) expect(Object.keys(put.body)).not.toContain(f);
  expect(Object.keys(put.body)).not.toContain('key');
  expect(put.body.display_name).toBe('Olaf der Zweite');

  await expect(page.getByTestId('save-ok')).toBeVisible();
  await expect(page.getByTestId('pending-badge')).toHaveText('Änderung ausstehend');
  await expect(page.getByTestId('rollout-button')).toBeVisible();
  // list marker refreshed too
  await expect(page.getByTestId('persona-ot-expert').getByTestId('pending-mark')).toBeVisible();
});

test('17b eingefrorene Persona: Speichern geht, aber kein „Ausrollen“', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?persona=bjoern`);
  await expect(page.getByTestId('status-badge')).toHaveText('eingefroren');
  await expect(page.getByTestId('frozen-hint')).toBeVisible();
  await page.getByLabel('Anzeigename').fill('Björn');
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await expect(page.getByTestId('rollout-button')).toHaveCount(0);
  await expect(page.getByTestId('pending-badge')).toHaveCount(0);
});

test('17c Änderungsnotiz allein lässt sich speichern (erzeugt „ausstehend“, ohne Inhalt zu ändern)', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(APP);
  await open(page, 'ot-expert');
  await expect(page.getByTestId('save-button')).toBeDisabled();
  await page.getByPlaceholder('Änderungsnotiz (optional) …').fill('Rollout-Test ohne Inhaltsänderung');
  await expect(page.getByTestId('save-button')).toBeEnabled();
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.change_note).toBe('Rollout-Test ohne Inhaltsänderung');
  expect(puts(calls)[0].body.display_name).toBe('Olaf');
  await expect(page.getByTestId('rollout-button')).toBeVisible();
});

// ---------------------------------------------------------------------------
// 18 — Ausrollen → job log
// ---------------------------------------------------------------------------

test('18 Ausrollen: POST /rollout, Job-Log pollt /runtime mit ⏳-Zeilen, Ende „Rollout ausstehend: …“', async ({ page }) => {
  const { calls } = await mockApi(page, { rolloutEnd: 'rollout_pending' });
  await page.goto(APP);
  await open(page, 'ot-expert');
  await page.getByLabel('Anzeigename').fill('Olaf 2');
  await page.getByTestId('save-button').click();
  await page.getByTestId('rollout-button').click();

  await expect.poll(() => calls.filter((c) => c.method === 'POST').map((c) => c.path)).toEqual([
    '/agentfirm-api/personas/ot-expert/rollout',
  ]);
  await expect(page.getByTestId('rollout-log-text')).toContainText('⏳ ot-expert: laufender Turn');
  await expect(page.getByTestId('rollout-result')).toHaveText(
    'Rollout ausstehend: ot-expert hat eine laufende Sitzung',
    { timeout: 10_000 },
  );
  await expect(page.getByTestId('rollout-log-text')).toContainText('⏸ ot-expert: Rollout verschoben');
  // polled the runtime endpoint more than once
  expect(calls.filter((c) => c.path === '/agentfirm-api/personas/ot-expert/runtime').length).toBeGreaterThanOrEqual(3);
  // still pending → the button is back
  await expect(page.getByTestId('rollout-button')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-personas-rollout.png', fullPage: true });
});

test('18b Ausrollen erfolgreich: „Ausgerollt“, Badge weg', async ({ page }) => {
  await mockApi(page, { rolloutEnd: 'rolled_out' });
  await page.goto(APP);
  await open(page, 'ot-expert');
  await page.getByPlaceholder('Änderungsnotiz (optional) …').fill('x');
  await page.getByTestId('save-button').click();
  await page.getByTestId('rollout-button').click();
  await expect(page.getByTestId('rollout-result')).toContainText('Ausgerollt', { timeout: 10_000 });
  await expect(page.getByTestId('pending-badge')).toHaveCount(0);
  await expect(page.getByTestId('rollout-button')).toHaveCount(0);
});

test('18c Ausrollen-Fehler (409) wird lesbar angezeigt', async ({ page }) => {
  await mockApi(page, {
    rollout: (k) => ({ status: 409, body: { detail: `${k}: Rollout läuft bereits` } }),
  });
  await page.goto(APP);
  await open(page, 'ot-expert');
  await page.getByPlaceholder('Änderungsnotiz (optional) …').fill('x');
  await page.getByTestId('save-button').click();
  await page.getByTestId('rollout-button').click();
  await expect(page.getByTestId('rollout-error')).toContainText('ot-expert: Rollout läuft bereits (HTTP 409)');
});

// ---------------------------------------------------------------------------
// 19 — Freigaben
// ---------------------------------------------------------------------------

test('19 Freigaben: log_only = „Protokollieren“, Trusted-Empfänger ohne Argument sperrt Speichern, 19 Standardregeln', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?persona=ot-expert&tab=approval`);

  const row = page.getByTestId('policy-m365_send_email');
  await expect(row.getByRole('radio', { name: 'Protokollieren' })).toHaveAttribute('aria-checked', 'true');
  await expect(row.getByRole('radio', { name: 'Nachfragen' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('policy-delete_event').getByRole('radio', { name: 'Nachfragen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // default box: the 19 gated tools, read-only, honest text
  const defaults = page.getByTestId('approval-defaults');
  await expect(defaults.getByTestId('gated-tools').locator('li')).toHaveCount(19);
  await expect(defaults.locator('input, button')).toHaveCount(0);
  await expect(defaults).toContainText('Standard ohne eigene Regel: erlaubt');
  await expect(defaults).toContainText('auch im Cron');
  await expect(page.getByText('fail-closed')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/admin-personas-approvals.png', fullPage: true });

  // recipient without match_arg → save locked
  await row.getByRole('radio', { name: 'Trusted-Empfänger' }).click();
  await expect(page.getByTestId('match-arg-missing')).toBeVisible();
  await expect(page.getByTestId('save-blocked')).toContainText('m365_send_email');
  await expect(page.getByTestId('save-button')).toBeDisabled();

  await row.getByTestId('match-arg').fill('to');
  await row.getByPlaceholder('*@pommerconsulting.de, chef@kunde.de').fill('*@pommerconsulting.de');
  await expect(page.getByTestId('save-blocked')).toHaveCount(0);
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.approval_policies.m365_send_email).toEqual({
    match_arg: 'to',
    trusted_patterns: ['*@pommerconsulting.de'],
    on_mismatch: 'require_approval',
  });
  expect(puts(calls)[0].body.approval_policies.delete_event).toEqual({ always: 'require_approval' });
});

test('19b Protokollieren wählen schickt always=log_only; 422 der API wird lesbar gezeigt', async ({ page }) => {
  const { calls } = await mockApi(page, {
    put: () => ({
      status: 422,
      body: {
        detail: [
          {
            type: 'value_error',
            loc: ['body', 'approval_policies'],
            msg: "Value error, Freigabe für 'delete_event': always muss eines von ['allow', 'deny', 'require_approval', 'log_only'] sein",
          },
        ],
      },
    }),
  });
  await page.goto(`${APP}?persona=ot-expert&tab=approval`);
  await page.getByTestId('policy-delete_event').getByRole('radio', { name: 'Protokollieren' }).click();
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.approval_policies.delete_event).toEqual({ always: 'log_only' });
  const err = page.getByTestId('save-error');
  await expect(err).toContainText('Nicht gespeichert (HTTP 422)');
  await expect(err).toContainText("Freigabe für 'delete_event': always muss eines von");
  await expect(err).not.toContainText('Value error');
  await expect(err).not.toContainText('value_error');
});

// ---------------------------------------------------------------------------
// 20 — Werkzeug-Gruppen + tab titles
// ---------------------------------------------------------------------------

test('20 Werkzeug-Gruppen: teams_write wählbar, firecrawl gesperrt mit Hold-Text, Tab-Titel', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(APP);
  await open(page, 'ot-expert');

  const tabs = await page.getByRole('tab').allTextContents();
  expect(tabs).toEqual(['Identität', 'Werkzeug-Gruppen', 'Freigaben', 'Wissen', 'Bild & Teams-App', 'Team', 'Verlauf']);

  await page.getByTestId('tab-coupling').click();
  const tw = page.getByTestId('group-teams_write');
  await expect(tw.getByRole('checkbox')).toBeEnabled();
  await expect(tw.getByRole('checkbox')).not.toBeChecked();

  const fc = page.getByTestId('group-firecrawl');
  await expect(fc.getByTestId('hold-badge')).toBeVisible();
  await expect(fc.getByTestId('hold-text')).toContainText('LinkedIn-Schutz');
  await expect(fc.getByRole('checkbox')).toBeDisabled();

  // namespace + tools on demand
  await tw.getByRole('button', { name: 'Details' }).click();
  await expect(tw.getByTestId('group-details')).toContainText('m365');
  await expect(tw.getByTestId('group-details')).toContainText('m365_send_chat_message');
  await expect(page.getByTestId('group-searxng').getByText('gibt nichts frei')).toHaveCount(0);
  await expect(page.getByTestId('group-_office_skill').getByText('gibt nichts frei')).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-personas-groups.png', fullPage: true });

  await tw.getByRole('checkbox').check();
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.skills).toEqual(['teams_read', 'searxng', 'teams_write']);
});

test('20b bereits vergebene gesperrte Gruppe bleibt sichtbar und lässt sich nur entfernen', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?persona=lead-hunter&tab=coupling`);
  const fc = page.getByTestId('group-firecrawl');
  await expect(fc.getByRole('checkbox')).toBeChecked();
  await expect(fc.getByRole('checkbox')).toBeEnabled();
  await expect(fc.getByTestId('hold-text')).toContainText('nur Entfernen möglich');
  await fc.getByRole('checkbox').uncheck();
  await expect(fc.getByRole('checkbox')).toBeDisabled();
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.skills).toEqual(['searxng']);
});

// ---------------------------------------------------------------------------
// 21 — Modell + Thinking
// ---------------------------------------------------------------------------

test('21 Modell-Select zeigt genau die 3 ehrlichen Namen; Thinking an → "medium", aus → null', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(APP);
  await open(page, 'helga');

  const opts = await page.getByTestId('model-select').locator('option').allTextContents();
  expect(opts).toEqual(['Nemotron (qwen36-35b) — Standard', 'Qwen3.8 (qwen3.8-27b-nvfp4)', 'Qwen3.8 (qwen38-nvfp4)']);
  await expect(page.getByText('gpt-4o')).toHaveCount(0);
  await expect(page.getByText('gemma4-e4b-judge')).toHaveCount(0);

  const toggle = page.getByTestId('thinking-toggle');
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByTestId('model-select').selectOption('qwen38-nvfp4');
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(1);
  expect(puts(calls)[0].body.reasoning).toBe('medium');
  expect(puts(calls)[0].body.model).toBe('qwen38-nvfp4');

  // ot-expert has thinking on → switching off sends null
  await open(page, 'ot-expert');
  await expect(page.getByTestId('thinking-toggle')).toBeChecked();
  await page.getByTestId('thinking-toggle').uncheck();
  await page.getByTestId('save-button').click();
  await expect.poll(() => puts(calls).length).toBe(2);
  expect(puts(calls)[1].body.reasoning).toBeNull();
});

// ---------------------------------------------------------------------------
// Avatar/Teams package, history, knowledge hint
// ---------------------------------------------------------------------------

test('Teams-Paket: Download zeigt die vergebene Version + Hinweis „ZIP ins Repo übernehmen“', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?persona=ot-expert&tab=avatar`);
  const download = page.waitForEvent('download');
  await page.getByTestId('teams-package').click();
  expect((await download).suggestedFilename()).toBe('ot-expert.zip');
  await expect(page.getByTestId('package-version')).toContainText('Paketversion 1.0.3');
  await expect(page.getByTestId('package-version')).toContainText('ZIP ins Repo übernehmen (deploy/teams-manifests)');
});

test('Judge ohne Teams-App: kein Paket-Button', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?persona=judge-fakten&tab=avatar`);
  await expect(page.getByTestId('no-teams-app')).toBeVisible();
  await expect(page.getByTestId('teams-package')).toHaveCount(0);
});

test('Verlauf: gleiche Version zweimal → zwei Einträge, JSON klappt nur einen auf', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?persona=ot-expert&tab=history`);
  await expect(page.getByTestId('history-entry')).toHaveCount(2);
  await page.getByTestId('history-entry').first().getByRole('button', { name: 'JSON' }).click();
  await expect(page.getByTestId('history-json')).toHaveCount(1);
  await expect(page.getByTestId('history-json')).toContainText('"n": 2');
});

test('Wissen-Tab: Hinweis „wirkt nach dem Ausrollen (Tier-B-Text sofort)“', async ({ page }) => {
  await mockApi(page);
  await page.goto(`${APP}?persona=ot-expert&tab=knowledge`);
  await expect(page.getByText('Änderungen wirken nach dem Ausrollen (der Text von Tier-B-Dokumenten sofort).')).toBeVisible();
});

test('Banner: CF-Access-Login, kein Bearer-Token', async ({ page }) => {
  await mockApi(page);
  await page.goto(APP);
  await expect(page.getByText('Login über Cloudflare Access')).toBeVisible();
  await expect(page.getByText(/Bearer/)).toHaveCount(0);
});

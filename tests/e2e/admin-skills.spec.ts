import { test, expect, type Page, type Route } from '@playwright/test';

// H8.14 Variante C — Akzeptanztest 16: Admin-Tab „Skill-Vorschläge".
//
// The real API (/agentfirm-api/skill-proposals, agentfirm shop-api :33400) requires a
// Cloudflare-Access JWT that does not exist locally/in CI, so the API is MOCKED per
// page.route. The mock records every request so the tests can assert what the UI sent.

const APP = '/admin/skills/';
const DETAIL = `${APP}?p=helga&s=hr-onboarding-email`;

const XSS_SKILL_MD = [
  '---',
  'name: hr-onboarding-email',
  'description: Onboarding-Mail an neue Mitarbeitende',
  '---',
  '# Onboarding-Mail',
  '<img src=x onerror="window.__xss = 1">',
  '<script>window.__xss2 = 1</script>',
].join('\n');

function scan(over: Record<string, unknown> = {}) {
  return {
    scanner: 'pass',
    pii_total: 0,
    pii_open: 0,
    carries_code: false,
    symlinks: 0,
    scanned_at: '2026-09-25T06:00:00Z',
    ...over,
  };
}

function item(persona: string, name: string, over: Record<string, unknown> = {}) {
  return {
    persona,
    name,
    state: 'reported',
    aborted: false,
    collected_at: '2026-09-24T20:00:00Z',
    reported_at: '2026-09-24T21:00:00Z',
    edited_at: null,
    container_changed: false,
    pr: null,
    rollout_pending: null,
    last_error: null,
    reason: null,
    repeats: null,
    scan: scan(),
    review: null,
    job: null,
    ...over,
  };
}

function fixtures() {
  const items: Record<string, any> = {
    'helga/hr-onboarding-email': item('helga', 'hr-onboarding-email', {
      scan: scan({ pii_total: 1, pii_open: 1 }),
      review: { recommendation: 'adopt', reason: 'sauber, <b>nützlich</b>' },
    }),
    'helga/urlaubsantrag': item('helga', 'urlaubsantrag', {
      state: 'edited',
      edited_at: '2026-09-25T05:00:00Z',
      container_changed: true,
    }),
    'helga/geburtstagsliste': item('helga', 'geburtstagsliste', { state: 'new', repeats: 2 }),
    'skill-smith/deploy-helper': item('skill-smith', 'deploy-helper', {
      state: 'adopting',
      aborted: true,
      scan: scan({ carries_code: true }),
      job: { status: 'aborted', kind: 'adopt' },
    }),
    'ferdinand/beleg-sortierer': item('ferdinand', 'beleg-sortierer', {
      state: 'merged',
      pr: 'https://github.com/klapom/agent-firm-V1/pull/99',
      rollout_pending: 'Rollout ausstehend: Haupt-Checkout nicht auf sauberem main',
    }),
  };
  const files: Record<string, any[]> = {
    'helga/hr-onboarding-email': [
      { path: '_meta.json', size: 300, control: true, editable: false },
      { path: 'SKILL.md', size: XSS_SKILL_MD.length, control: false, editable: true, content: XSS_SKILL_MD },
      {
        path: 'references/notes.md',
        size: 40,
        control: false,
        editable: true,
        content: 'Hinweise\nKonto: DE89370400440532013000\n',
      },
    ],
  };
  const piiHits: Record<string, any[]> = {
    'helga/hr-onboarding-email': [
      { id: 'pii-1', kind: 'iban', file: 'references/notes.md', line: 2, match: 'DE89370400440532013000' },
    ],
  };
  const rejected = {
    'helga/geburtstagsliste': {
      reason: 'enthält Personendaten',
      at: '2026-09-20T10:00:00Z',
      repeats: 2,
      reported: 1,
    },
  };
  return { items, files, piiHits, rejected };
}

type Recorded = { method: string; path: string; body: any };

interface MockOpts {
  adopt?: (key: string) => { status: number; body: unknown };
  /** successive responses of GET …/job */
  jobSequence?: unknown[];
}

async function mockApi(page: Page, opts: MockOpts = {}) {
  const fx = fixtures();
  const calls: Recorded[] = [];
  const jobSeq = [...(opts.jobSequence ?? [])];

  await page.route('**/agentfirm-api/skill-proposals**', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const rest = url.pathname.replace(/^.*\/agentfirm-api\/skill-proposals/, '');
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

    if (parts.length === 0 && method === 'GET') {
      return json(200, { proposals: Object.values(fx.items), rejected: fx.rejected, repo_index: [] });
    }
    const key = `${parts[0]}/${parts[1]}`;
    const it = fx.items[key];
    if (!it) return json(404, { detail: 'Entwurf nicht gefunden' });
    const action = parts[2];

    if (!action && method === 'GET') {
      return json(200, {
        ...it,
        meta: { state: it.state, pii_ack: [] },
        scan_detail: {
          scanner: { status: it.scan.scanner },
          pii: fx.piiHits[key] ?? [],
          carries_code: it.scan.carries_code,
          symlinks: [],
        },
        scan_current: true,
        files: fx.files[key] ?? [
          { path: 'SKILL.md', size: 10, control: false, editable: true, content: '# ' + it.name },
        ],
        rejected_entry: (fx.rejected as any)[key] ?? null,
      });
    }
    if (action === 'job' && method === 'GET') {
      const next = jobSeq.length > 1 ? jobSeq.shift() : jobSeq[0];
      return json(200, next ?? { state: it.state, job: it.job, log_tail: '', last_error: null, pr: null });
    }
    if (action === 'files' && (method === 'PUT' || method === 'DELETE')) {
      return json(200, { state: 'edited', meta: {}, scan: it.scan, scan_detail: {} });
    }
    if (action === 'pii-ack' && method === 'POST') {
      return json(200, { pii_ack: body.ids, scan: it.scan });
    }
    if (action === 'reject' && method === 'POST') {
      it.state = 'rejected';
      it.reason = body.reason;
      return json(200, { state: 'rejected', reason: body.reason });
    }
    if (action === 'adopt' && method === 'POST') {
      const r = opts.adopt ? opts.adopt(key) : { status: 202, body: { state: 'adopting', job: { status: 'running' } } };
      if (r.status === 202) {
        it.state = 'adopting';
        it.job = { status: 'running', kind: 'adopt' };
      }
      return json(r.status, r.body);
    }
    if (action === 'rollout' && method === 'POST') {
      it.state = 'rolling_out';
      it.job = { status: 'running', kind: 'rollout' };
      return json(202, { state: 'rolling_out', job: it.job });
    }
    return json(405, { detail: `mock: ${method} ${rest} nicht vorgesehen` });
  });
  return { calls, fx };
}

const mutating = (calls: Recorded[]) => calls.filter((c) => c.method !== 'GET');

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

test('Liste lädt: je Persona gruppiert, Badges, Ampel, Hinweise, Urteil, Wiederholungen', async ({ page }) => {
  await mockApi(page);
  await page.goto(APP);

  await expect(page.getByTestId('group-helga')).toBeVisible();
  await expect(page.getByTestId('group-skill-smith')).toBeVisible();
  await expect(page.getByTestId('group-ferdinand')).toBeVisible();

  const hr = page.getByTestId('proposal-helga-hr-onboarding-email');
  await expect(hr.getByTestId('state-badge')).toHaveText('gemeldet');
  await expect(hr.getByTestId('scan-lights')).toContainText('Scanner grün');
  await expect(hr.getByTestId('scan-lights')).toContainText('PII offen: 1/1');
  await expect(hr.getByTestId('review')).toContainText('übernehmen');
  // verdict text is untrusted too: shown literally
  await expect(hr.getByTestId('review')).toContainText('<b>nützlich</b>');

  const edited = page.getByTestId('proposal-helga-urlaubsantrag');
  await expect(edited.getByTestId('hint-container-changed')).toBeVisible();
  await expect(edited.getByTestId('review')).toHaveText('Skilli: kein strukturiertes Urteil');

  await expect(page.getByTestId('proposal-skill-smith-deploy-helper').getByTestId('hint-aborted')).toBeVisible();
  await expect(page.getByTestId('proposal-skill-smith-deploy-helper').getByTestId('scan-lights')).toContainText(
    'trägt Code',
  );
  await expect(page.getByTestId('proposal-helga-geburtstagsliste').getByTestId('hint-repeats')).toContainText('2×');
  await expect(page.getByTestId('rejected-list')).toContainText('helga/geburtstagsliste');
  await expect(page.getByTestId('rejected-list')).toContainText('enthält Personendaten');

  // link format = Teams deep-link format
  await expect(hr.getByRole('link', { name: 'hr-onboarding-email' })).toHaveAttribute(
    'href',
    '/admin/skills/?p=helga&s=hr-onboarding-email',
  );
  await page.screenshot({ path: 'test-results/admin-skills-list.png', fullPage: true });
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

test('Deep-Link ?p=&s= öffnet das Detail mit SKILL.md und references/*', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(DETAIL);

  await expect(page.getByTestId('detail-title')).toHaveText('helga/hr-onboarding-email');
  await expect(page.getByTestId('file-SKILL.md').getByTestId('file-content')).toContainText('# Onboarding-Mail');
  await expect(page.getByTestId('file-references/notes.md').getByTestId('file-content')).toContainText('Hinweise');
  // control files are not shown
  await expect(page.getByTestId('file-_meta.json')).toHaveCount(0);
  expect(calls.some((c) => c.method === 'GET' && c.path.endsWith('/skill-proposals/helga/hr-onboarding-email'))).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/admin-skills-detail.png', fullPage: true });
});

test('XSS-Gegenprobe: <img onerror> im SKILL.md wird als Text gezeigt, nicht ausgeführt', async ({ page }) => {
  await mockApi(page);
  await page.goto(DETAIL);
  const pre = page.getByTestId('file-SKILL.md').getByTestId('file-content');
  await expect(pre).toContainText('<img src=x onerror="window.__xss = 1">');
  await expect(pre).toContainText('<script>window.__xss2 = 1</script>');
  // no element was created from the draft content …
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  await expect(pre.locator('script')).toHaveCount(0);
  // … and nothing ran
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  expect(await page.evaluate(() => (window as any).__xss2)).toBeUndefined();

  // Gegenprobe that the probe itself works: the same payload assigned via innerHTML DOES fire.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<img src=x onerror="window.__xssProbe = 1">';
    document.body.appendChild(d);
  });
  await expect.poll(() => page.evaluate(() => (window as any).__xssProbe)).toBe(1);
});

test('Bad-Link wird abgewiesen, ohne API-Aufruf', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(`${APP}?p=../etc&s=passwd`);
  await expect(page.getByTestId('bad-link')).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('Speichern schickt PUT mit dem neuen Inhalt', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(DETAIL);
  const card = page.getByTestId('file-references/notes.md');
  await card.getByRole('button', { name: 'Bearbeiten' }).click();
  await card.getByRole('textbox').fill('Hinweise\nKonto: entfernt\n');
  await card.getByRole('button', { name: 'Speichern' }).click();

  await expect.poll(() => mutating(calls).length).toBe(1);
  const put = mutating(calls)[0];
  expect(put.method).toBe('PUT');
  expect(put.path).toBe('/agentfirm-api/skill-proposals/helga/hr-onboarding-email/files/references/notes.md');
  expect(put.body).toEqual({ content: 'Hinweise\nKonto: entfernt\n' });
});

test('Löschen nur nach eigener Bestätigung; SKILL.md nicht löschbar', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(DETAIL);
  await expect(page.getByTestId('file-SKILL.md').getByRole('button', { name: 'Löschen' })).toHaveCount(0);

  const card = page.getByTestId('file-references/notes.md');
  await card.getByRole('button', { name: 'Löschen' }).click();
  await expect(card.getByTestId('confirm-delete')).toBeVisible();
  await card.getByRole('button', { name: 'Abbrechen' }).click();
  expect(mutating(calls)).toHaveLength(0);

  await card.getByRole('button', { name: 'Löschen' }).click();
  await card.getByRole('button', { name: 'Ja, löschen' }).click();
  await expect.poll(() => mutating(calls).length).toBe(1);
  expect(mutating(calls)[0].method).toBe('DELETE');
  expect(mutating(calls)[0].path).toBe(
    '/agentfirm-api/skill-proposals/helga/hr-onboarding-email/files/references/notes.md',
  );
});

test('PII-Treffer mit Datei:Zeile, Ack schickt die Treffer-ID', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(DETAIL);
  const pii = page.getByTestId('pii-section');
  await expect(pii).toContainText('references/notes.md:2');
  await expect(pii).toContainText('iban');
  await pii.getByRole('checkbox').check();
  await pii.getByRole('button', { name: /kein PII/ }).click();
  await expect.poll(() => mutating(calls).length).toBe(1);
  expect(mutating(calls)[0]).toMatchObject({ method: 'POST', body: { ids: ['pii-1'] } });
});

test('Ablehnen ist ohne Grund deaktiviert, mit Grund schickt es POST reject', async ({ page }) => {
  const { calls } = await mockApi(page);
  await page.goto(DETAIL);
  const rej = page.getByTestId('reject-section');
  const btn = rej.getByRole('button', { name: 'Ablehnen' });
  await expect(btn).toBeDisabled();
  await rej.getByRole('textbox').fill('   ');
  await expect(btn).toBeDisabled();
  await rej.getByRole('textbox').fill('doppelt zu hr-onboarding');
  await expect(btn).toBeEnabled();
  await btn.click();
  await expect.poll(() => mutating(calls).length).toBe(1);
  expect(mutating(calls)[0]).toMatchObject({
    method: 'POST',
    path: '/agentfirm-api/skill-proposals/helga/hr-onboarding-email/reject',
    body: { reason: 'doppelt zu hr-onboarding' },
  });
  await expect(page.getByTestId('detail-title').locator('..').getByTestId('state-badge')).toHaveText('abgelehnt');
});

test('Übernehmen startet den Job und zeigt das Job-Log bis zum Ende', async ({ page }) => {
  const { calls } = await mockApi(page, {
    jobSequence: [
      {
        state: 'adopting',
        job: { status: 'running', kind: 'adopt' },
        log_tail: 'Scanner pass, PII offen 0, Code=False',
        last_error: null,
        pr: null,
      },
      {
        state: 'rolled_out',
        job: { status: 'done', kind: 'adopt', exit_code: 0 },
        log_tail: 'Scanner pass, PII offen 0, Code=False\nPR https://github.com/klapom/agent-firm-V1/pull/100\nfertig: rolled_out',
        last_error: null,
        pr: 'https://github.com/klapom/agent-firm-V1/pull/100',
      },
    ],
  });
  await page.goto(DETAIL);
  const adopt = page.getByTestId('adopt-section');
  // no code in this draft → no "Code akzeptieren" checkbox
  await expect(adopt.getByText('Code akzeptieren')).toHaveCount(0);
  await adopt.getByRole('button', { name: 'Übernehmen' }).click();

  const log = page.getByTestId('job-log');
  await expect(log).toBeVisible();
  await expect(log.getByTestId('job-log-text')).toContainText('fertig: rolled_out', { timeout: 10000 });
  await expect(log.getByTestId('job-status')).toContainText('fertig');
  const post = mutating(calls)[0];
  expect(post).toMatchObject({
    method: 'POST',
    path: '/agentfirm-api/skill-proposals/helga/hr-onboarding-email/adopt',
    body: { accept_code: false, rollout: true },
  });
  // polling actually happened (≥2 job reads)
  expect(calls.filter((c) => c.path.endsWith('/job')).length).toBeGreaterThanOrEqual(2);
});

test('Code-Entwurf: Checkbox „Code akzeptieren" erscheint und wird mitgeschickt', async ({ page }) => {
  const { calls } = await mockApi(page, {
    jobSequence: [{ state: 'merged', job: { status: 'done', exit_code: 0 }, log_tail: 'ok', last_error: null, pr: null }],
  });
  await page.goto(`${APP}?p=skill-smith&s=deploy-helper`);
  const adopt = page.getByTestId('adopt-section');
  await adopt.getByLabel(/Code akzeptieren/).check();
  await adopt.getByRole('button', { name: 'Übernehmen' }).click();
  await expect.poll(() => mutating(calls).length).toBe(1);
  expect(mutating(calls)[0].body).toEqual({ accept_code: true, rollout: true });
});

test('409 mit Problems-Objekt wird lesbar angezeigt', async ({ page }) => {
  await mockApi(page, {
    adopt: () => ({
      status: 409,
      body: {
        detail: {
          message: 'Übernahme blockiert',
          problems: ['PII-Treffer unbestätigt: references/notes.md:2 (iban)', 'Scanner rot: prompt injection'],
        },
      },
    }),
  });
  await page.goto(DETAIL);
  await page.getByTestId('adopt-section').getByRole('button', { name: 'Übernehmen' }).click();
  const err = page.getByTestId('adopt-error');
  await expect(err).toContainText('Übernahme blockiert');
  await expect(err.locator('li')).toHaveCount(2);
  await expect(err).toContainText('references/notes.md:2 (iban)');
  await expect(err).toContainText('Scanner rot: prompt injection');
  await expect(page.getByTestId('job-log')).toHaveCount(0);
});

test('409 mit String-Detail wird angezeigt', async ({ page }) => {
  await mockApi(page, { adopt: () => ({ status: 409, body: { detail: 'Job läuft bereits' } }) });
  await page.goto(DETAIL);
  await page.getByTestId('adopt-section').getByRole('button', { name: 'Übernehmen' }).click();
  await expect(page.getByTestId('adopt-error')).toContainText('Job läuft bereits');
  await expect(page.getByTestId('adopt-error')).toContainText('409');
});

test('Rollout-Button bei merged/rollout_pending startet den Rollout', async ({ page }) => {
  const { calls } = await mockApi(page, {
    jobSequence: [
      { state: 'rolled_out', job: { status: 'done', kind: 'rollout', exit_code: 0 }, log_tail: 'alle Zusicherungen gruen', last_error: null, pr: null },
    ],
  });
  await page.goto(`${APP}?p=ferdinand&s=beleg-sortierer`);
  await expect(page.getByText('Rollout ausstehend: Haupt-Checkout nicht auf sauberem main')).toBeVisible();
  // merged draft: no adopt/reject, no editing
  await expect(page.getByTestId('adopt-section')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
  await page.getByTestId('rollout-section').getByRole('button', { name: 'Rollout starten' }).click();
  await expect.poll(() => mutating(calls).length).toBe(1);
  expect(mutating(calls)[0]).toMatchObject({
    method: 'POST',
    path: '/agentfirm-api/skill-proposals/ferdinand/beleg-sortierer/rollout',
  });
  await expect(page.getByTestId('job-log-text')).toContainText('alle Zusicherungen gruen');
});

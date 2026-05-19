import { test, expect } from '@playwright/test';

const MOCK_TENANT = {
  id: 't_testid12345',
  bearer_token: 'pommer_testtoken',
  name: 'Test GmbH',
  branche: 'J',
  created_at: '2026-05-19T10:00:00Z',
};

const MOCK_AUDIT_REPORT = {
  source_coverage_score: 0.85,
  gap_count: 2,
  recommendation_count: 3,
  gaps: [
    { severity: 'high', description: 'Fehlende Service-Katalog-Dokumentation.' },
    { severity: 'low', description: 'Kein Glossar vorhanden.' },
  ],
  recommendations: [
    'Service-Katalog als YAML bereitstellen.',
    'Glossar anlegen.',
    'SLA-Dokument ergänzen.',
  ],
  _stub: false,
};

const WIZARD_STATE_BASE = {
  tenantId: MOCK_TENANT.id,
  token: MOCK_TENANT.bearer_token,
  company: 'Test GmbH',
  branche: 'J',
  selectedPersonas: ['helga', 'cora'],
  uploads: [],
  audit: MOCK_AUDIT_REPORT,
};

/** Inject wizard state into localStorage after a page load */
async function injectState(page: import('@playwright/test').Page, data: object) {
  await page.evaluate((d) => {
    localStorage.setItem('pommer_wizard_state', JSON.stringify(d));
  }, data);
}

test('Activation — notification_status queued shows ✓ icon and queued-mail copy', async ({ page }) => {
  await page.goto('/onboarding');
  await injectState(page, WIZARD_STATE_BASE);

  await page.route(`**/tenants/${MOCK_TENANT.id}/activate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activation_id: 'a_queued01',
        tenant_id: MOCK_TENANT.id,
        requested_at: new Date().toISOString(),
        notification_status: 'queued',
      }),
    }),
  );

  await page.goto('/onboarding?step=7');
  await expect(page.getByRole('heading', { name: 'Zusammenfassung & Aktivierung' })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /Pommer Consulting kontaktiert/i }).click();

  // Modal must appear
  await expect(page.getByText('Anfrage eingegangen')).toBeVisible({ timeout: 5000 });

  // queued branch: ✓ icon (not ✉️), queued-specific body copy
  await expect(page.getByText('✓')).toBeVisible();
  await expect(page.getByText(/Mail-Versand wird im Hintergrund nachgezogen/i)).toBeVisible();

  // ✉️ icon must NOT appear for the queued branch
  await expect(page.getByText('✉️')).not.toBeVisible();
});

test('Activation — API 500 → inline error banner, no modal, button re-enabled', async ({ page }) => {
  await page.goto('/onboarding');
  await injectState(page, WIZARD_STATE_BASE);

  await page.route(`**/tenants/${MOCK_TENANT.id}/activate`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Internal Server Error' }),
    }),
  );

  await page.goto('/onboarding?step=7');
  await expect(page.getByRole('heading', { name: 'Zusammenfassung & Aktivierung' })).toBeVisible({ timeout: 5000 });

  const activateBtn = page.getByRole('button', { name: /Pommer Consulting kontaktiert/i });
  await activateBtn.click();

  // Error banner must appear (the component sets error text from the thrown Error message)
  // On a 500 the api helper throws — the catch block calls setError(e.message)
  // The banner element has class bg-red-900/40; match by its visible text content
  const errorBanner = page.locator('.bg-red-900\\/40');
  await expect(errorBanner).toBeVisible({ timeout: 5000 });

  // Success modal must NOT appear
  await expect(page.getByText('Anfrage eingegangen')).not.toBeVisible();

  // Button must remain enabled (submitted stays false on error — button is disabled only when submitting||submitted)
  await expect(activateBtn).toBeEnabled();
});

test('Activation — after success the activate button is disabled with ✓ Angefragt label', async ({ page }) => {
  await page.goto('/onboarding');
  await injectState(page, WIZARD_STATE_BASE);

  await page.route(`**/tenants/${MOCK_TENANT.id}/activate`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        activation_id: 'a_test',
        tenant_id: MOCK_TENANT.id,
        requested_at: new Date().toISOString(),
        notification_status: 'sent',
      }),
    }),
  );

  await page.goto('/onboarding?step=7');
  await expect(page.getByRole('heading', { name: 'Zusammenfassung & Aktivierung' })).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: /Pommer Consulting kontaktiert/i }).click();

  // Modal appears — success path
  await expect(page.getByText('Anfrage eingegangen')).toBeVisible({ timeout: 5000 });

  // The activate button must now be disabled and show the post-submit label
  const doneBtn = page.locator('#activate-btn');
  await expect(doneBtn).toBeDisabled();
  await expect(doneBtn).toHaveText('✓ Angefragt');
});

test('McpRegistry step — shows heading and BYO-form with empty MCP list', async ({ page }) => {
  await page.goto('/onboarding');
  await injectState(page, WIZARD_STATE_BASE);

  // Mock GET /tenants/{id}/mcps → empty list
  await page.route(`**/tenants/${MOCK_TENANT.id}/mcps`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    return route.continue();
  });

  await page.goto('/onboarding?step=2');
  await expect(page.getByRole('heading', { name: 'Datenquellen (MCPs)' })).toBeVisible({ timeout: 5000 });

  // BYO-form "MCP hinzufügen" section must be visible
  await expect(page.getByText('MCP hinzufügen')).toBeVisible();

  // Empty-state message while list is empty
  await expect(page.getByText(/Noch keine MCPs registriert/i)).toBeVisible({ timeout: 5000 });
});

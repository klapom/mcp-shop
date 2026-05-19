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

const MOCK_AUDIT_RESPONSE = {
  audit_id: 'a_abc123',
  tenant_id: MOCK_TENANT.id,
  report: MOCK_AUDIT_REPORT,
};

/** Inject wizard state into localStorage after a page load */
async function injectState(page: import('@playwright/test').Page, data: object) {
  await page.evaluate((d) => {
    localStorage.setItem('pommer_wizard_state', JSON.stringify(d));
  }, data);
}

test.describe('Onboarding Wizard — Happy Path', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API: POST /tenants
    await page.route('**/tenants', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TENANT),
        });
      } else {
        await route.continue();
      }
    });

    // Mock API: POST /tenants/*/audit
    await page.route('**/tenants/*/audit', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_AUDIT_RESPONSE),
        });
      } else {
        await route.continue();
      }
    });

    // Mock API: POST /tenants/*/uploads
    await page.route('**/tenants/*/uploads', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            upload_id: 'u_test01',
            filename: 'test.txt',
            size_bytes: 100,
            sha256: 'abc123',
            qdrant_indexed: false,
          }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test('Step 0 — loads onboarding page with form', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveTitle(/Onboarding.*Pommer Agents/);
    // Use heading role to be precise
    await expect(page.getByRole('heading', { name: 'Account anlegen' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Firmenname')).toBeVisible();
    await expect(page.getByLabel('Branche (NACE)')).toBeVisible();
  });

  test('Step 0 → 1 — fill account form and submit', async ({ page }) => {
    await page.goto('/onboarding');

    await page.getByLabel('Firmenname').fill('Test GmbH');
    await page.getByLabel('Branche (NACE)').selectOption('J');

    // Use exact submit button text
    await page.getByRole('button', { name: 'Account anlegen & weiter' }).click();

    // Should advance to step 1
    await expect(page.getByRole('heading', { name: 'Personas auswählen' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 1 — select 2 personas and advance', async ({ page }) => {
    // Navigate first to establish page context for localStorage
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: [],
    });

    await page.goto('/onboarding?step=1');
    await expect(page.getByRole('heading', { name: 'Personas auswählen' })).toBeVisible({ timeout: 5000 });

    // Click first two persona cards
    const cards = page.locator('[data-persona-key]');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    await cards.nth(0).click();
    await cards.nth(1).click();

    await expect(page.getByRole('button', { name: /Auswahl bestätigen \(2\)/i })).toBeVisible();
    await page.getByRole('button', { name: /Auswahl bestätigen \(2\)/i }).click();

    await expect(page.getByRole('heading', { name: 'Wissens-Dokumente hochladen' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 2 — skip upload and advance', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['helga', 'cora'],
      uploads: [],
    });

    await page.goto('/onboarding?step=2');
    await expect(page.getByRole('heading', { name: 'Wissens-Dokumente hochladen' })).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Überspringen/i }).click();
    await expect(page.getByRole('heading', { name: 'Wissens-Audit mit Helga' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 3 — start audit (mocked) and advance to report', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['helga', 'cora'],
      uploads: [],
    });

    await page.goto('/onboarding?step=3');
    await expect(page.getByRole('heading', { name: 'Wissens-Audit mit Helga' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Willkommen bei Pommer Agents/i)).toBeVisible();

    await page.getByRole('button', { name: /Ja, starte Audit/i }).click();

    // Auto-advances to step 4 after audit completes
    await expect(page.getByRole('heading', { name: 'Audit-Report' })).toBeVisible({ timeout: 8000 });
  });

  test('Step 4 — audit report shows score and advances', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['helga', 'cora'],
      uploads: [],
      audit: MOCK_AUDIT_REPORT,
    });

    await page.goto('/onboarding?step=4');
    await expect(page.getByRole('heading', { name: 'Audit-Report' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('85%')).toBeVisible();

    await page.getByRole('button', { name: /Weiter zur Persona-Personalisierung/i }).click();
    await expect(page.getByRole('heading', { name: 'Avatar-Personalisierung' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 5 → 6 — skip avatar and see review', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['helga', 'cora'],
      uploads: [],
      audit: MOCK_AUDIT_REPORT,
    });

    await page.goto('/onboarding?step=5');
    await expect(page.getByRole('heading', { name: 'Avatar-Personalisierung' })).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /Persona-Defaults beibehalten/i }).click();
    await expect(page.getByRole('heading', { name: 'Zusammenfassung & Aktivierung' })).toBeVisible({ timeout: 5000 });
  });

  test('Step 6 — review shows company, score, activate CTA, success modal', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['helga', 'cora'],
      uploads: [],
      audit: MOCK_AUDIT_REPORT,
    });

    await page.goto('/onboarding?step=6');
    await expect(page.getByRole('heading', { name: 'Zusammenfassung & Aktivierung' })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Test GmbH')).toBeVisible();
    await expect(page.getByText('85%')).toBeVisible();

    await expect(page.getByRole('button', { name: /Pommer Consulting kontaktiert/i })).toBeVisible();
    await page.getByRole('button', { name: /Pommer Consulting kontaktiert/i }).click();
    await expect(page.getByText('Anfrage eingegangen')).toBeVisible({ timeout: 3000 });
  });
});

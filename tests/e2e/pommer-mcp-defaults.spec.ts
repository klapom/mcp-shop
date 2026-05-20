import { test, expect } from '@playwright/test';

const MOCK_TENANT = {
  id: 't_testid12345',
  bearer_token: 'pommer_testtoken',
};

/** Inject wizard state into localStorage after a page load */
async function injectState(page: import('@playwright/test').Page, data: object) {
  await page.evaluate((d) => {
    localStorage.setItem('pommer_wizard_state', JSON.stringify(d));
  }, data);
}

async function readPommerMcps(page: import('@playwright/test').Page): Promise<string[] | undefined> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('pommer_wizard_state');
    return raw ? JSON.parse(raw).pommerMcps : undefined;
  });
}

test.describe('P28a — Pommer-MCP-Defaults im MCP-Step', () => {
  test.beforeEach(async ({ page }) => {
    // MCP-list endpoint → empty (no BYO MCPs registered)
    await page.route('**/tenants/*/mcps', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        await route.continue();
      }
    });
  });

  test('Defaults sind anhand der Persona-Auswahl vorausgewählt', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['lead-hunter', 'ot-expert'],
    });

    await page.goto('/onboarding?step=2');
    await expect(page.getByRole('heading', { name: 'Datenquellen (MCPs)' })).toBeVisible({ timeout: 5000 });

    // lead-hunter ∪ ot-expert → linkedin, searxng, m365, ot-knowledge, itil
    for (const id of ['linkedin', 'searxng', 'm365', 'ot-knowledge', 'itil']) {
      await expect(page.locator(`[data-pommer-mcp="${id}"] input`)).toBeChecked();
    }
    // servicenow + fnt nutzt keine der beiden Personas → nicht vorausgewählt
    for (const id of ['servicenow', 'fnt']) {
      await expect(page.locator(`[data-pommer-mcp="${id}"] input`)).not.toBeChecked();
    }
  });

  test('Abwählen persistiert in localStorage', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['lead-hunter'],
    });

    await page.goto('/onboarding?step=2');
    await expect(page.getByRole('heading', { name: 'Datenquellen (MCPs)' })).toBeVisible({ timeout: 5000 });

    // lead-hunter default: linkedin, searxng, m365
    await expect(page.locator('[data-pommer-mcp="searxng"] input')).toBeChecked();
    await page.locator('[data-pommer-mcp="searxng"] input').uncheck();
    await expect(page.locator('[data-pommer-mcp="searxng"] input')).not.toBeChecked();

    const stored = await readPommerMcps(page);
    expect(stored).toBeDefined();
    expect(stored).not.toContain('searxng');
    expect(stored).toEqual(expect.arrayContaining(['linkedin', 'm365']));
  });

  test('Gespeicherte Auswahl überschreibt die Defaults beim Wiederbetreten', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['lead-hunter'],
      // Customer hat zuvor alles abgewählt
      pommerMcps: [],
    });

    await page.goto('/onboarding?step=2');
    await expect(page.getByRole('heading', { name: 'Datenquellen (MCPs)' })).toBeVisible({ timeout: 5000 });

    // Keine Vorauswahl, obwohl lead-hunter Defaults hätte
    for (const id of ['linkedin', 'searxng', 'm365']) {
      await expect(page.locator(`[data-pommer-mcp="${id}"] input`)).not.toBeChecked();
    }
  });

  test('Persona ohne Default-MCPs zeigt leere Vorauswahl', async ({ page }) => {
    await page.goto('/onboarding');
    await injectState(page, {
      tenantId: MOCK_TENANT.id,
      token: MOCK_TENANT.bearer_token,
      company: 'Test GmbH',
      branche: 'J',
      selectedPersonas: ['eike'],
    });

    await page.goto('/onboarding?step=2');
    await expect(page.getByRole('heading', { name: 'Datenquellen (MCPs)' })).toBeVisible({ timeout: 5000 });

    // useEffect persistiert die (leere) Default-Auswahl nach dem Mount
    await expect.poll(() => readPommerMcps(page)).toEqual([]);
  });
});

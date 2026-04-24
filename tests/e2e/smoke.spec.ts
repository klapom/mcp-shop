import { test, expect } from '@playwright/test';

const PRODUCT_SLUGS = ['itil', 'servicenow', 'ot', 'fnt', 'searxng', 'standortiq'];

test.describe('Smoke — all pages load', () => {
  test('homepage loads with hero', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Pommer Agents/);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('link', { name: /Produkte ansehen/i }).first()).toBeVisible();
  });

  test('product index page loads', async ({ page }) => {
    await page.goto('/products');
    await expect(page).toHaveTitle(/Produkte.*Pommer Agents/);
    await expect(page.locator('h1')).toContainText('Knowledge-Produkte');
  });

  for (const slug of PRODUCT_SLUGS) {
    test(`product detail page loads: ${slug}`, async ({ page }) => {
      await page.goto(`/products/${slug}`);
      await expect(page).toHaveTitle(/Pommer Agents/);
      // Breadcrumb navigation present (in main, not header)
      await expect(page.locator('main').getByRole('link', { name: 'Produkte' })).toBeVisible();
    });
  }

  test('checkout success page loads', async ({ page }) => {
    await page.goto('/checkout/success');
    await expect(page).toHaveTitle(/Erfolgreich.*Pommer Agents/);
  });
});

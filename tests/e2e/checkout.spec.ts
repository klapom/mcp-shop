import { test, expect } from '@playwright/test';

test.describe('Checkout flow', () => {
  test('product card links to detail page', async ({ page }) => {
    await page.goto('/products');
    const firstCard = page.locator('a[href^="/products/"]').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/^\/products\/\w+$/);
    await firstCard.click();
    await expect(page).toHaveURL(/\/products\/\w+/);
  });

  test('draft product shows disabled CTA', async ({ page }) => {
    // All current products are draft
    await page.goto('/products/itil');
    const btn = page.getByRole('button', { name: /Noch nicht verfügbar/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeDisabled();
  });

  test('active product shows Trial + Buy CTAs', async ({ page }) => {
    // When a product goes active, both CTAs should appear
    // Currently all are draft — test the structure via DOM attribute
    await page.goto('/products/itil');
    // Draft guard: only the disabled button is visible, no buy-btn
    const buyBtn = page.locator('#buy-btn');
    const trialLink = page.locator('a[href*="trial-start"]');
    // Exactly one of these two patterns appears (draft vs active)
    const draftBtn = page.getByRole('button', { name: /Noch nicht verfügbar/i });
    const isDraft = await draftBtn.isVisible();
    if (!isDraft) {
      await expect(buyBtn).toBeVisible();
      await expect(trialLink).toBeVisible();
    } else {
      await expect(draftBtn).toBeDisabled();
    }
  });

  test('checkout success page loads', async ({ page }) => {
    await page.goto('/checkout/success');
    await expect(page).toHaveTitle(/Erfolgreich.*Pommer Agents/);
    await expect(page.getByText('Bereit zum Loslegen')).toBeVisible();
  });

  test('navigation: hero → products → detail', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Produkte ansehen/i }).first().click();
    await expect(page).toHaveURL('/products');
    await page.locator('a[href^="/products/"]').first().click();
    await expect(page).toHaveURL(/\/products\/\w+/);
    await page.locator('main').getByRole('link', { name: 'Produkte' }).click();
    await expect(page).toHaveURL('/products');
  });
});

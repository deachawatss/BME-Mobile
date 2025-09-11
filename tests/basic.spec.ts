import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page).toHaveTitle(/Warehouse Management/);
});

test('login page is accessible', async ({ page }) => {
  await page.goto('http://localhost:4200');
  await expect(page.locator('h1')).toContainText('Warehouse Management System');
});

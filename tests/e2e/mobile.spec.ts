import { expect, test } from '@playwright/test';

test('mobile: the hero fits and the menu opens', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.rz-hero__title')).toBeVisible();
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(1);
	await page.goto('/docs/');
	await page.getByRole('button', { name: 'Menu' }).click();
	await expect(page.locator('nav.sidebar a').first()).toBeVisible();
});

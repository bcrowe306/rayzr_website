import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const site = JSON.parse(fs.readFileSync('src/generated/site.json', 'utf8'));
const features = JSON.parse(fs.readFileSync('src/generated/features.json', 'utf8'));
const defaultVersion = site.versions.find((v: { isDefault: boolean }) => v.isDefault);

test('home: hero, downloads call to action, highlights', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.rz-hero__title')).toContainText('Make 2D games');
	await expect(page.locator('.rz-hero .rz-btn--primary')).toHaveAttribute('href', /\/download\//);
	await expect(page.locator('.rz-hero__shot img')).toBeVisible();
	const highlights = features.features.filter((f: { highlight?: boolean }) => f.highlight).length;
	await expect(page.locator('.rz-cards .rz-card')).toHaveCount(highlights);
	// (No duplicate page title above the hero.)
	await expect(page.locator('h1')).toHaveCount(1);
});

test('header navigation reaches every site page', async ({ page }) => {
	await page.goto('/');
	for (const [label, path] of [['Features', '/features/'], ['Download', '/download/'], ['Contact', '/contact/'], ['Docs', defaultVersion.base]]) {
		await page.locator('.rz-nav').getByRole('link', { name: label }).click();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
	}
});

test('features: every feature, grouped, with working doc links', async ({ page, request }) => {
	await page.goto('/features/');
	await expect(page.locator('.rz-card')).toHaveCount(features.features.length);
	for (const g of features.groups) await expect(page.getByRole('heading', { name: g, level: 2 })).toBeVisible();
	const hrefs = await page.locator('.rz-card__link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
	for (const h of new Set(hrefs)) expect((await request.get(h)).status(), h).toBe(200);
});

test('download: the synced manifest is rendered', async ({ page }) => {
	await page.goto('/download/');
	const manifest = JSON.parse(fs.readFileSync('src/generated/manifest.json', 'utf8'));
	if (!manifest.stable.length && !manifest.dev) {
		await expect(page.locator('.rz-downloads--empty')).toBeVisible();
		return;
	}
	await expect(page.locator('.rz-dl-button').first()).toBeVisible();
	await expect(page.locator('.rz-release')).toHaveCount(manifest.stable.length + (manifest.dev ? 1 : 0));
});

test('contact: email and contribution paths', async ({ page }) => {
	await page.goto('/contact/');
	await expect(page.locator('a[href="mailto:support@rayzr.app"]').first()).toBeVisible();
	await expect(page.getByText('Contribute code')).toBeVisible();
});

test('docs: annotated screenshots have numbered callouts and a legend', async ({ page }) => {
	await page.goto(`${defaultVersion.base}editor/tour/`);
	const fig = page.locator('.rz-annotated').first();
	await expect(fig.locator('img')).toBeVisible();
	const n = await fig.locator('.rz-callout').count();
	expect(n).toBeGreaterThan(3);
	await expect(fig.locator('.rz-annotated__legend li')).toHaveCount(n);
	// Callouts sit inside the image.
	const box = (await fig.locator('.rz-annotated__frame').boundingBox())!;
	for (const c of await fig.locator('.rz-callout').all()) {
		const b = (await c.boundingBox())!;
		expect(b.x).toBeGreaterThanOrEqual(box.x - 1);
		expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
	}
});

test('docs: node reference pages', async ({ page }) => {
	await page.goto(`${defaultVersion.base}reference/nodes/camera-node/`);
	await expect(page.getByRole('heading', { name: 'Camera 2D', level: 1 })).toBeVisible();
	await expect(page.getByRole('cell', { name: 'isCurrent' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Lua methods' })).toBeVisible();
});

test('docs: each version has its own sidebar, banner and switcher', async ({ page }) => {
	for (const v of site.versions) {
		await page.goto(v.base);
		const links = await page.locator('nav.sidebar a[href^="/docs/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
		expect(links.length).toBeGreaterThan(10);
		for (const l of links) expect(l.startsWith(v.base), `${l} in ${v.id}`).toBe(true);
		if (v.isDefault) await expect(page.locator('.sl-banner')).toHaveCount(0);
		else await expect(page.locator('.sl-banner')).toBeVisible();
	}
	test.skip(site.versions.length < 2, 'one version: no switcher');
	const other = site.versions.find((v: { isDefault: boolean }) => !v.isDefault);
	await page.goto(`${defaultVersion.base}editor/tour/`);
	await page.locator('select[data-rz-version]').selectOption(other.id);
	await expect(page).toHaveURL(new RegExp(`${other.base}editor/tour/$`));
});

test('docs: previous / next stay in the version', async ({ page }) => {
	const v = site.versions.at(-1);
	await page.goto(`${v.base}getting-started/installation/`);
	for (const a of await page.locator('.pagination-links a').all()) {
		expect(await a.getAttribute('href')).toMatch(new RegExp(`^${v.base}`));
	}
});

test('search finds the docs', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Search' }).first().click();
	await page.locator('.pagefind-ui__search-input').fill('camera');
	await expect(page.locator('.pagefind-ui__result').first()).toBeVisible({ timeout: 10_000 });
});

test('site-info.json describes the build', async ({ request }) => {
	const info = await (await request.get('/site-info.json')).json();
	expect(info.versions.map((v: { id: string }) => v.id)).toEqual(site.versions.map((v: { id: string }) => v.id));
	expect(info.defaultVersion).toBe(site.defaultId);
});

import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the built site (`npm run build` first): the
// preview server serves dist/. CI runs them before every deploy.
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: { baseURL: 'http://localhost:4330', trace: 'retain-on-failure' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' }, testIgnore: /mobile\.spec/ },
		{ name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
	],
	webServer: { command: 'npx astro preview --port 4330 --ignore-lock', url: 'http://localhost:4330', reuseExistingServer: !process.env.CI, timeout: 60_000 },
});

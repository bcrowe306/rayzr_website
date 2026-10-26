import { defineConfig } from 'vitest/config';

// Unit tests only (tests/e2e/ is Playwright's: npx playwright test).
export default defineConfig({
	test: { include: ['tests/unit/**/*.test.ts'] },
});

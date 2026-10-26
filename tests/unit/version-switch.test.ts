import { describe, expect, it } from 'vitest';
import { targetPath } from '../../src/lib/version-switch';

const versions = [
	{ id: 'v0.3.0', base: '/docs/', slugs: ['', 'editor/tour', 'guides/paths'] },
	{ id: 'dev', base: '/docs/dev/', slugs: ['', 'editor/tour', 'guides/paths', 'guides/new-feature'] },
];

describe('targetPath', () => {
	it('keeps the page when the other version has it', () => {
		expect(targetPath('/docs/editor/tour/', 'v0.3.0', 'dev', versions)).toBe('/docs/dev/editor/tour/');
		expect(targetPath('/docs/dev/guides/paths/', 'dev', 'v0.3.0', versions)).toBe('/docs/guides/paths/');
	});
	it('goes to the start page when it does not', () => {
		expect(targetPath('/docs/dev/guides/new-feature/', 'dev', 'v0.3.0', versions)).toBe('/docs/');
	});
	it('maps the start pages', () => {
		expect(targetPath('/docs/', 'v0.3.0', 'dev', versions)).toBe('/docs/dev/');
		expect(targetPath('/docs/dev/', 'dev', 'v0.3.0', versions)).toBe('/docs/');
	});
	it('copes with unknown versions and paths', () => {
		expect(targetPath('/docs/x/', 'v0.3.0', 'nope', versions)).toBe('/docs/x/');
		expect(targetPath('/features/', 'v0.3.0', 'dev', versions)).toBe('/docs/dev/');
	});
});

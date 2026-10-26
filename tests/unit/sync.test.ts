import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadManifest, versionFrontmatter } from '../../scripts/sync.mjs';

describe('versionFrontmatter', () => {
	const page = '---\ntitle: "Tour"\n---\n\nBody\n';
	it('adds the slug', () => {
		expect(versionFrontmatter(page, 'docs/v0.1.0/editor/tour', null)).toBe('---\nslug: "docs/v0.1.0/editor/tour"\ntitle: "Tour"\n---\n\nBody\n');
	});
	it('adds the banner', () => {
		const out = versionFrontmatter(page, 'docs/dev', 'Dev <a href="/docs/">latest</a>');
		expect(out).toContain('banner:\n  content: "Dev <a href=\\"/docs/\\">latest</a>"\n');
	});
	it('leaves pages without frontmatter alone', () => {
		expect(versionFrontmatter('# Hi\n', 'docs', null)).toBe('# Hi\n');
	});
});

describe('loadManifest', () => {
	it('reads a file', async () => {
		const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rz-')), 'm.json');
		fs.writeFileSync(f, JSON.stringify({ schema: 1, latest: '0.1.0', stable: [], dev: null }));
		expect((await loadManifest(f)).latest).toBe('0.1.0');
	});
	it('falls back to empty outside CI', async () => {
		const ci = process.env.CI;
		delete process.env.CI;
		try {
			expect((await loadManifest('/nonexistent/manifest.json')).stable).toEqual([]);
		} finally {
			if (ci) process.env.CI = ci;
		}
	});
});

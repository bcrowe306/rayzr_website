import { describe, expect, it } from 'vitest';
import {
	emptyManifest,
	pageId,
	planVersions,
	sidebarSlugs,
	versionBanner,
	versionGroupLabel,
	versionOfId,
	versionSidebar,
} from '../../scripts/lib/versions.mjs';

const entry = (version: string, prerelease = false) => ({ version, tag: `v${version}`, prerelease });

describe('planVersions', () => {
	it('builds only dev when nothing is released', () => {
		const p = planVersions(emptyManifest());
		expect(p.defaultId).toBe('dev');
		expect(p.versions).toHaveLength(1);
		expect(p.versions[0]).toMatchObject({ id: 'dev', isDefault: true, prefix: '', base: '/docs/', ref: 'main' });
	});

	it('treats a null / missing manifest as empty', () => {
		expect(planVersions(null).defaultId).toBe('dev');
		expect(planVersions(undefined).versions).toHaveLength(1);
	});

	it('makes the latest release the default and keeps dev under /docs/dev/', () => {
		const p = planVersions({ ...emptyManifest(), latest: '0.3.0', stable: [entry('0.3.0'), entry('0.2.0')], dev: entry('0.4.0-dev.7', true) });
		expect(p.defaultId).toBe('v0.3.0');
		const byId = Object.fromEntries(p.versions.map((v) => [v.id, v]));
		expect(byId['v0.3.0']).toMatchObject({ base: '/docs/', prefix: '', label: 'v0.3.0 (latest)', ref: 'v0.3.0' });
		expect(byId['v0.2.0']).toMatchObject({ base: '/docs/v0.2.0/', prefix: 'v0.2.0' });
		expect(byId.dev).toMatchObject({ base: '/docs/dev/', label: 'dev (0.4.0-dev.7)', channel: 'dev' });
	});

	it('keeps at most three releases', () => {
		const p = planVersions({ ...emptyManifest(), latest: '0.4.0', stable: ['0.4.0', '0.3.0', '0.2.0', '0.1.0'].map((v) => entry(v)) });
		expect(p.versions.map((v) => v.id)).toEqual(['v0.4.0', 'v0.3.0', 'v0.2.0', 'dev']);
	});

	it('follows the manifest\'s latest (a full release over a newer beta)', () => {
		const p = planVersions({ ...emptyManifest(), latest: '0.2.0', stable: [entry('0.3.0-beta.1', true), entry('0.2.0')] });
		expect(p.defaultId).toBe('v0.2.0');
		expect(p.versions.find((v) => v.id === 'v0.3.0-beta.1')?.base).toBe('/docs/v0.3.0-beta.1/');
	});

	it('uses another dev branch when asked', () => {
		expect(planVersions(emptyManifest(), { devRef: 'release-dryrun' }).versions[0].ref).toBe('release-dryrun');
	});
});

describe('sidebars and ids', () => {
	const p = planVersions({ ...emptyManifest(), latest: '0.3.0', stable: [entry('0.3.0')] });
	const [latest, dev] = p.versions;
	const bundle = [
		{ label: 'Start', items: [{ label: 'Intro', slug: '' }, { label: 'Install', slug: 'getting-started/installation' }] },
		{ label: 'Reference', items: [{ label: 'Nodes', collapsed: true, items: [{ label: 'Overview', slug: 'reference/nodes' }] }] },
	];

	it('maps slugs to content ids per version', () => {
		expect(pageId(latest, '')).toBe('docs');
		expect(pageId(latest, 'editor/tour')).toBe('docs/editor/tour');
		expect(pageId(dev, 'editor/tour')).toBe('docs/dev/editor/tour');
		expect(pageId(dev, '')).toBe('docs/dev');
	});

	it('wraps a version\'s sidebar in its group', () => {
		const s = versionSidebar(dev, bundle);
		expect(s.label).toBe(versionGroupLabel('dev'));
		expect(s.items[0].items[0]).toEqual({ label: 'Intro', slug: 'docs/dev' });
		expect(s.items[1].items[0]).toEqual({ label: 'Nodes', collapsed: true, items: [{ label: 'Overview', slug: 'docs/dev/reference/nodes' }] });
	});

	it('lists every page slug', () => {
		expect(sidebarSlugs(bundle)).toEqual(['', 'getting-started/installation', 'reference/nodes']);
	});

	it('finds the version of a page', () => {
		expect(versionOfId('docs/dev/editor/tour', p.versions)?.id).toBe('dev');
		expect(versionOfId('docs/editor/tour', p.versions)?.id).toBe('v0.3.0');
		expect(versionOfId('docs', p.versions)?.id).toBe('v0.3.0');
		expect(versionOfId('features', p.versions)).toBeNull();
		expect(versionOfId('', p.versions)).toBeNull();
	});

	it('banners only non-default versions', () => {
		expect(versionBanner(latest, latest)).toBeNull();
		expect(versionBanner(dev, latest)).toContain('development build');
		expect(versionBanner(dev, latest)).toContain('href="/docs/"');
	});
});

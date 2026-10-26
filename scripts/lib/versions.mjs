// Which documentation versions the site builds and where they live, from
// the downloads manifest (https://downloads.rayzr.app/manifest.json, written
// by the engine's scripts/ci/publish_r2.py). Pure functions: tests/unit.
//
//   /docs/          the default version: the latest release, or the dev
//                   build while there is no release yet
//   /docs/dev/      the latest dev build (main) when a release is the default
//   /docs/v0.1.0/   the other releases the manifest keeps (at most 3 in all)

export const MAX_RELEASES = 3;

/** An empty manifest (no releases yet, or the manifest couldn't be read). */
export function emptyManifest() {
	return { schema: 1, updated: null, base_url: 'https://downloads.rayzr.app', latest: null, stable: [], dev: null };
}

/**
 * The versions to build: each release in the manifest (newest first, at most
 * MAX_RELEASES) and the dev build (main).
 * @returns {{ defaultId: string, versions: Array<{id, label, version, ref, channel, prerelease, isDefault, prefix, base}> }}
 */
export function planVersions(manifest, { devRef = 'main' } = {}) {
	const m = manifest ?? emptyManifest();
	const stable = (m.stable ?? []).slice(0, MAX_RELEASES);
	const versions = stable.map((e) => ({
		id: `v${e.version}`,
		label: `v${e.version}`,
		version: e.version,
		ref: e.tag ?? `v${e.version}`,
		channel: 'stable',
		prerelease: Boolean(e.prerelease),
	}));
	versions.push({
		id: 'dev',
		label: m.dev ? `dev (${m.dev.version})` : 'dev (main)',
		version: m.dev?.version ?? '',
		ref: devRef,
		channel: 'dev',
		prerelease: true,
	});
	const latest = m.latest && versions.some((v) => v.version === m.latest) ? `v${m.latest}` : null;
	const defaultId = latest ?? (versions.find((v) => v.channel === 'stable')?.id || 'dev');
	for (const v of versions) {
		v.isDefault = v.id === defaultId;
		v.prefix = v.isDefault ? '' : v.id;
		v.base = v.prefix ? `/docs/${v.prefix}/` : '/docs/';
		if (v.isDefault && v.channel === 'stable') v.label += ' (latest)';
	}
	return { defaultId, versions };
}

/** The content collection id of a page: docs[/<prefix>][/<slug>]. */
export function pageId(version, slug) {
	return ['docs', version.prefix, slug].filter(Boolean).join('/');
}

/** The group label that wraps a version's sidebar (routeData.ts unwraps it). */
export const versionGroupLabel = (id) => `__version:${id}`;

/**
 * A bundle's sidebar ({label, slug} | {label, items, collapsed}) as
 * Starlight sidebar items for one version, wrapped in that version's group.
 */
export function versionSidebar(version, bundleSidebar) {
	const convert = (it) => {
		if (it.items) {
			const g = { label: it.label, items: it.items.map(convert) };
			if (it.collapsed) g.collapsed = true;
			return g;
		}
		return { label: it.label, slug: pageId(version, it.slug) };
	};
	return { label: versionGroupLabel(version.id), items: bundleSidebar.map(convert) };
}

/** Every page slug in a bundle sidebar (for the version switcher). */
export function sidebarSlugs(bundleSidebar) {
	const out = [];
	const walk = (items) => {
		for (const it of items) {
			if (it.items) walk(it.items);
			else out.push(it.slug);
		}
	};
	walk(bundleSidebar);
	return out;
}

/**
 * The version a page belongs to, from its content id (docs/dev/...,
 * docs/v0.1.0/..., or docs/... for the default).
 */
export function versionOfId(id, versions) {
	const parts = id.split('/');
	if (parts[0] !== 'docs') return null;
	const prefixed = versions.find((v) => v.prefix && parts[1] === v.prefix);
	return prefixed ?? versions.find((v) => v.isDefault) ?? null;
}

/** The banner shown on pages of versions other than the default. */
export function versionBanner(version, defaultVersion) {
	if (version.isDefault) return null;
	const latest = defaultVersion ? `<a href="${defaultVersion.base}">${defaultVersion.label}</a>` : 'the latest version';
	if (version.channel === 'dev') {
		return `You are reading the docs for the development build (main): features here may not be in a release yet. See ${latest}.`;
	}
	return `You are reading the docs for ${version.label}, an older release. See ${latest}.`;
}

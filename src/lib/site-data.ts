// The data `npm run sync` writes to src/generated/ (with fallbacks, so the
// site still builds - without docs - before a sync).
import type { DownloadsManifest } from './downloads';

export interface DocVersion {
	id: string;
	label: string;
	version: string;
	ref: string;
	channel: 'stable' | 'dev';
	prerelease: boolean;
	isDefault: boolean;
	prefix: string;
	base: string;
	commit?: string;
	slugs: string[];
}

export interface Feature {
	title: string;
	description: string;
	icon: string;
	group: string;
	highlight?: boolean;
	docs?: string;
	url?: string;
	image?: string;
}

const generated = import.meta.glob<{ default: unknown }>('../generated/*.json', { eager: true });
const get = <T>(name: string, fallback: T): T => (generated[`../generated/${name}.json`]?.default as T) ?? fallback;

export function siteData(): { defaultId: string; versions: DocVersion[]; generated?: string } {
	return get('site', { defaultId: 'dev', versions: [] as DocVersion[] });
}

export function manifest(): DownloadsManifest {
	return get('manifest', { schema: 1, updated: null, base_url: 'https://downloads.rayzr.app', latest: null, stable: [], dev: null });
}

export function features(): { groups: string[]; features: Feature[] } {
	return get('features', { groups: [], features: [] });
}

/** The default docs version's base path ("/docs/"). */
export function docsBase(): string {
	return siteData().versions.find((v) => v.isDefault)?.base ?? '/docs/';
}

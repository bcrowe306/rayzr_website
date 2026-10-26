// /site-info.json: what this deployment contains (scripts/verify-deploy.mjs
// checks it after a deploy: the versions and their commits, the manifest it
// was built with).
import type { APIRoute } from 'astro';
import { features, manifest, siteData } from '../lib/site-data';

export const GET: APIRoute = () => {
	const site = siteData();
	const m = manifest();
	return new Response(
		JSON.stringify(
			{
				generated: site.generated ?? null,
				build: process.env.SITE_BUILD_ID ?? null,
				defaultVersion: site.defaultId,
				versions: site.versions.map((v) => ({ id: v.id, label: v.label, base: v.base, isDefault: v.isDefault, version: v.version, commit: v.commit ?? null, pages: v.slugs.length })),
				manifestUpdated: m.updated,
				latest: m.latest,
				features: features().features.length,
			},
			null,
			2,
		),
		{ headers: { 'content-type': 'application/json' } },
	);
};

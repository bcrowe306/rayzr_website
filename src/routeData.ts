// Per-version sidebars: the config's sidebar has one group per documentation
// version (scripts/lib/versions.mjs versionSidebar); a docs page shows only
// its own version's entries, and its previous / next links stay inside them.
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import type { StarlightRouteData } from '@astrojs/starlight/route-data';
import { versionGroupLabel, versionOfId } from '../scripts/lib/versions.mjs';
import { siteData } from './lib/site-data';

type Entry = StarlightRouteData['sidebar'][number];
type Link = Extract<Entry, { type: 'link' }>;

function links(entries: Entry[], out: Link[] = []): Link[] {
	for (const e of entries) {
		if (e.type === 'link') out.push(e);
		else links(e.entries, out);
	}
	return out;
}

export const onRequest = defineRouteMiddleware((context) => {
	const route = context.locals.starlightRoute;
	const { versions } = siteData();
	const version = versionOfId(route.id, versions);
	if (!version) {
		// (Site pages - home, features, download, contact - have no sidebar.)
		route.sidebar = [];
		return;
	}
	const group = route.sidebar.find(
		(e): e is Extract<Entry, { type: 'group' }> => e.type === 'group' && e.label === versionGroupLabel(version.id),
	);
	route.sidebar = group ? group.entries : [];
	const all = links(route.sidebar);
	const i = all.findIndex((l) => l.isCurrent);
	route.pagination = {
		prev: i > 0 ? all[i - 1] : undefined,
		next: i >= 0 && i < all.length - 1 ? all[i + 1] : undefined,
	};
	(context.locals as { rayzrVersion?: unknown }).rayzrVersion = version;
});

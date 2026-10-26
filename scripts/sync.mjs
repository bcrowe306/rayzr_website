#!/usr/bin/env node
// Syncs the site with the engine: the downloads manifest, each documented
// version's docs and the features list. Run before every build
// (`npm run build` does it); CI runs it on every deploy.
//
//   node scripts/sync.mjs
//
// Environment (all optional):
//   MANIFEST_URL  the downloads manifest (URL or file path)
//                 default https://downloads.rayzr.app/manifest.json
//   ENGINE_REPO   the engine repository, default https://github.com/bcrowe306/rayzr.git
//   ENGINE_DIR    a local engine checkout used for the dev version instead of
//                 main (the engine's own CI, local previews of doc changes)
//   ENGINE_DIR_FOR_ALL=1  build every version from ENGINE_DIR (previews and
//                 tests of the version picker before those tags exist)
//   DEV_REF       the branch the dev version comes from, default main
//   PYTHON        default python3
//
// For each version (scripts/lib/versions.mjs) it checks out only the docs
// (a blobless clone + sparse checkout in .cache/), runs that version's own
// scripts/docs/export_site.py, and copies the pages into
// src/content/docs/docs/<prefix>/. It writes src/generated/: site.json
// (versions, sidebars, page lists), manifest.json, features.json, images/.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	emptyManifest,
	pageId,
	planVersions,
	sidebarSlugs,
	versionBanner,
	versionSidebar,
} from './lib/versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const DOCS_OUT = path.join(ROOT, 'src', 'content', 'docs', 'docs');
const GEN = path.join(ROOT, 'src', 'generated');

const MANIFEST_URL = process.env.MANIFEST_URL || 'https://downloads.rayzr.app/manifest.json';
const ENGINE_REPO = process.env.ENGINE_REPO || 'https://github.com/bcrowe306/rayzr.git';
const ENGINE_DIR = process.env.ENGINE_DIR ? path.resolve(process.env.ENGINE_DIR) : '';
const DEV_REF = process.env.DEV_REF || 'main';
const ENGINE_DIR_FOR_ALL = Boolean(process.env.ENGINE_DIR_FOR_ALL) && Boolean(ENGINE_DIR);
const PYTHON = process.env.PYTHON || 'python3';

// What a version's docs need from the engine (sparse checkout patterns).
const SPARSE = [
	'/docs/',
	'/scripts/docs/',
	'/engine/docs/',
	'/engine/*.md',
	'/engine/definitions/',
	'/editor/*.md',
	'/editor/docs/',
	'/editor/definitions/',
	'/templates/README.md',
	'/templates/*/README.md',
	'/templates/*/template.json',
	'/templates/*/preview.png',
	'/README.md',
	'/RELEASING.md',
];

const log = (...a) => console.log('[sync]', ...a);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();

export async function loadManifest(source = MANIFEST_URL) {
	try {
		if (/^https?:\/\//.test(source)) {
			const res = await fetch(source, { headers: { 'cache-control': 'no-cache' } });
			if (res.status === 404) {
				log(`no manifest at ${source} yet: dev docs only`);
				return emptyManifest();
			}
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		}
		return JSON.parse(fs.readFileSync(source, 'utf8'));
	} catch (e) {
		if (process.env.CI && !process.env.ALLOW_NO_MANIFEST) throw new Error(`manifest ${source}: ${e.message}`);
		log(`manifest ${source} unavailable (${e.message}): dev docs only`);
		return emptyManifest();
	}
}

function engineCache() {
	const dir = path.join(CACHE, 'engine');
	if (!fs.existsSync(path.join(dir, '.git')) && !fs.existsSync(path.join(dir, 'HEAD'))) {
		fs.mkdirSync(CACHE, { recursive: true });
		log(`cloning ${ENGINE_REPO} (blobless)`);
		run('git', ['clone', '--filter=blob:none', '--no-checkout', '--quiet', ENGINE_REPO, dir]);
	} else {
		run('git', ['-C', dir, 'fetch', '--quiet', '--tags', '--force', 'origin', '+refs/heads/*:refs/remotes/origin/*']);
	}
	run('git', ['-C', dir, 'worktree', 'prune']);
	return dir;
}

/** A checkout of `ref` with only the docs (a worktree of the cache clone). */
function checkout(cache, id, ref) {
	const dir = path.join(CACHE, 'src', id);
	if (fs.existsSync(dir)) {
		try {
			run('git', ['-C', cache, 'worktree', 'remove', '--force', dir]);
		} catch {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}
	run('git', ['-C', cache, 'worktree', 'prune']);
	const target = ref.startsWith('v') ? `refs/tags/${ref}` : `origin/${ref}`;
	run('git', ['-C', cache, 'worktree', 'add', '--quiet', '--no-checkout', '--detach', dir, target]);
	run('git', ['-C', dir, 'sparse-checkout', 'set', '--no-cone', ...SPARSE]);
	run('git', ['-C', dir, 'checkout', '--quiet']);
	return dir;
}

function copyDir(src, dst) {
	fs.mkdirSync(dst, { recursive: true });
	for (const e of fs.readdirSync(src, { withFileTypes: true })) {
		const s = path.join(src, e.name);
		const d = path.join(dst, e.name);
		if (e.isDirectory()) copyDir(s, d);
		else fs.copyFileSync(s, d);
	}
}

/**
 * A page's frontmatter for its version: `slug` (Starlight would slugify the
 * version's dots away: docs/v0.3.0/... must stay as it is) and, for versions
 * other than the default, the `banner`.
 */
export function versionFrontmatter(markdown, slug, html) {
	if (!markdown.startsWith('---\n')) return markdown;
	let fm = `---\nslug: ${JSON.stringify(slug)}\n`;
	if (html) fm += `banner:\n  content: ${JSON.stringify(html)}\n`;
	return markdown.replace(/^---\n/, fm);
}

function walkMarkdown(dir, fn) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walkMarkdown(p, fn);
		else if (e.name.endsWith('.md')) fn(p);
	}
}

async function main() {
	const manifest = await loadManifest();
	const plan = planVersions(manifest, { devRef: DEV_REF });
	log(`versions: ${plan.versions.map((v) => `${v.id}${v.isDefault ? ' (default)' : ''}`).join(', ')}`);

	fs.rmSync(DOCS_OUT, { recursive: true, force: true });
	fs.rmSync(GEN, { recursive: true, force: true });
	fs.mkdirSync(path.join(GEN, 'images'), { recursive: true });

	let cache = null;
	const defaultVersion = plan.versions.find((v) => v.isDefault);
	const done = [];
	let features = null;
	for (const v of plan.versions) {
		let src;
		try {
			if ((v.channel === 'dev' || ENGINE_DIR_FOR_ALL) && ENGINE_DIR) {
				src = ENGINE_DIR;
			} else {
				cache ??= engineCache();
				src = checkout(cache, v.id, v.ref);
			}
			const exporter = path.join(src, 'scripts', 'docs', 'export_site.py');
			if (!fs.existsSync(exporter)) throw new Error(`${v.ref} has no scripts/docs/export_site.py`);
			const out = path.join(CACHE, 'bundles', v.id);
			const ref = v.channel === 'dev' ? DEV_REF : v.ref;
			const res = run(PYTHON, [exporter, '--out', out, '--base', v.base, '--ref', ref, '--version', v.version || v.label]);
			log(res.trim());
			const bundle = JSON.parse(fs.readFileSync(path.join(out, 'bundle.json'), 'utf8'));
			const dst = path.join(DOCS_OUT, v.prefix);
			copyDir(path.join(out, 'pages'), dst);
			const banner = versionBanner(v, defaultVersion);
			walkMarkdown(dst, (p) => {
				// (Only this version's pages: the default version's folder holds the others' too.)
				const rel = path.relative(dst, p).replace(/\\/g, '/');
				if (!v.prefix && done.some((o) => o.prefix && rel.startsWith(`${o.prefix}/`))) return;
				const slug = rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
				fs.writeFileSync(p, versionFrontmatter(fs.readFileSync(p, 'utf8'), pageId(v, slug), banner));
			});
			done.push({ ...v, commit: bundle.commit, slugs: sidebarSlugs(bundle.sidebar), sidebar: versionSidebar(v, bundle.sidebar) });
			// The features list: the dev build's (features as they land), else the default's.
			const fpath = path.join(out, 'features.json');
			if (fs.existsSync(fpath) && (v.channel === 'dev' || !features)) {
				features = JSON.parse(fs.readFileSync(fpath, 'utf8'));
				fs.rmSync(path.join(GEN, 'images'), { recursive: true, force: true });
				copyDir(path.join(out, 'images'), path.join(GEN, 'images'));
				// (Its doc links point into that version: use the default version's docs.)
				for (const f of features.features) {
					if (f.url && v.prefix) f.url = f.url.replace(v.base, defaultVersion.base);
				}
			}
		} catch (e) {
			const msg = (e.stderr?.toString() || e.message).trim();
			if (v.isDefault) throw new Error(`the default version ${v.id} failed: ${msg}`);
			console.warn(`[sync] warning: skipped ${v.id}: ${msg}`);
		}
	}

	const site = {
		generated: new Date().toISOString(),
		defaultId: plan.defaultId,
		versions: done.map(({ sidebar, ...rest }) => rest),
		sidebar: done.map((v) => v.sidebar),
	};
	fs.writeFileSync(path.join(GEN, 'site.json'), JSON.stringify(site, null, 2));
	fs.writeFileSync(path.join(GEN, 'manifest.json'), JSON.stringify(manifest, null, 2));
	fs.writeFileSync(path.join(GEN, 'features.json'), JSON.stringify(features ?? { groups: [], features: [] }, null, 2));
	const pages = done.reduce((n, v) => n + v.slugs.length, 0);
	log(`done: ${done.length} version(s), ${pages} sidebar pages -> src/content/docs/docs/, src/generated/`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((e) => {
		console.error('[sync] error:', e.message);
		process.exit(1);
	});
}

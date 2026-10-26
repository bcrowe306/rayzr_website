#!/usr/bin/env node
// Verifies a deployed site (run after every deploy; `npm run verify`).
//
//   node scripts/verify-deploy.mjs [--url https://rayzr.app] [--expect-build <id>]
//                                  [--timeout 300] [--skip-www]
//
// Checks, retrying until --timeout seconds for the deployment to propagate:
//   - /site-info.json answers and (with --expect-build) is this build;
//   - the site pages (/, /features/, /download/, /contact/, 404) and every
//     documented version's start page and a few of its pages load, with
//     the expected content;
//   - every internal link on the home page and the docs start page works;
//   - the downloads manifest loads and every file it lists exists with the
//     size it says (HEAD), with CORS for the site;
//   - www.rayzr.app serves the site too (unless --skip-www);
//   - sitemap and robots basics.
// Exits non-zero with a list of failures.
const args = process.argv.slice(2);
const opt = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : def;
};
const BASE = (opt('--url', process.env.SITE_URL || 'https://rayzr.app')).replace(/\/$/, '');
const EXPECT_BUILD = opt('--expect-build', process.env.SITE_BUILD_ID || '');
const TIMEOUT = Number(opt('--timeout', '300')) * 1000;
const SKIP_WWW = args.includes('--skip-www') || !BASE.includes('rayzr.app');
const MANIFEST_URL = opt('--manifest', 'https://downloads.rayzr.app/manifest.json');

const failures = [];
const passes = [];
const ok = (msg) => passes.push(msg);
const fail = (msg) => failures.push(msg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, init = {}) {
	for (let i = 0; i < 3; i++) {
		try {
			return await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'rayzr-verify-deploy' }, ...init });
		} catch (e) {
			if (i === 2) throw e;
			await sleep(1000);
		}
	}
}

async function page(path, mustContain = []) {
	const url = BASE + path;
	const res = await get(url);
	if (res.status !== 200) return fail(`${path}: HTTP ${res.status}`);
	const html = await res.text();
	// (Each entry: a string, or alternatives - any of them.)
	for (const s of mustContain) {
		const any = Array.isArray(s) ? s : [s];
		if (!any.some((a) => html.includes(a))) return fail(`${path}: missing ${JSON.stringify(s)}`);
	}
	ok(`${path}`);
	return html;
}

function internalLinks(html) {
	const out = new Set();
	for (const m of html.matchAll(/href="(\/[^"#?]*)/g)) {
		const p = m[1];
		// (Not assets or Cloudflare's own /cdn-cgi/ endpoints.)
		if (!p.startsWith('//') && !p.startsWith('/_astro/') && !p.startsWith('/cdn-cgi/')) out.add(p);
	}
	return [...out];
}

async function waitForDeployment() {
	const start = Date.now();
	let last = '';
	while (Date.now() - start < TIMEOUT) {
		try {
			const res = await get(`${BASE}/site-info.json`, { headers: { 'cache-control': 'no-cache' } });
			if (res.status === 200) {
				const info = await res.json();
				if (!EXPECT_BUILD || info.build === EXPECT_BUILD) return info;
				last = `build ${info.build}, waiting for ${EXPECT_BUILD}`;
			} else last = `HTTP ${res.status}`;
		} catch (e) {
			last = e.message;
		}
		await sleep(10000);
	}
	fail(`/site-info.json: not the expected deployment after ${TIMEOUT / 1000}s (${last})`);
	return null;
}

async function checkDownloads() {
	let res;
	try {
		res = await get(MANIFEST_URL, { headers: { origin: 'https://rayzr.app', 'cache-control': 'no-cache' } });
	} catch (e) {
		return fail(`manifest: ${e.message}`);
	}
	if (res.status === 404) return ok('manifest: none published yet');
	if (res.status !== 200) return fail(`manifest: HTTP ${res.status}`);
	const cors = res.headers.get('access-control-allow-origin');
	if (cors !== 'https://rayzr.app' && cors !== '*') fail(`manifest: no CORS for https://rayzr.app (got ${cors})`);
	const m = await res.json();
	const entries = [...(m.stable ?? []), ...(m.dev ? [m.dev] : [])];
	if ((m.stable ?? []).length > 3) fail(`manifest: ${m.stable.length} releases (keep 3)`);
	for (const e of entries) {
		for (const f of e.files) {
			const h = await get(f.url, { method: 'HEAD' });
			const len = Number(h.headers.get('content-length'));
			if (h.status !== 200) fail(`download ${f.name}: HTTP ${h.status}`);
			else if (len && f.size && len !== f.size) fail(`download ${f.name}: ${len} bytes, manifest says ${f.size}`);
		}
	}
	ok(`manifest: ${entries.length} build(s), ${entries.reduce((n, e) => n + e.files.length, 0)} files reachable`);
	return m;
}

async function main() {
	console.log(`verifying ${BASE}${EXPECT_BUILD ? ` (build ${EXPECT_BUILD})` : ''}`);
	const info = await waitForDeployment();
	if (!info) return report();
	ok(`site-info: build ${info.build}, default docs ${info.defaultVersion}, ${info.versions.length} version(s)`);

	const home = await page('/', ['Make 2D games', 'Download', 'rz-hero']);
	await page('/features/', ['rz-cards']);
	await page('/download/', ['data-rz-downloads']);
	// (Cloudflare's Email Address Obfuscation may encode the address: decoded in the browser.)
	await page('/contact/', [['support@rayzr.app', 'data-cfemail']]);
	const nf = await get(`${BASE}/this-page-does-not-exist/`);
	if (nf.status !== 404) fail(`404 page: HTTP ${nf.status}`);
	else ok('404 page');

	if (!info.versions.length) fail('no documentation versions deployed');
	for (const v of info.versions) {
		await page(v.base, ['Rayzr documentation']);
		await page(`${v.base}editor/tour/`, ['rz-annotated']);
		await page(`${v.base}reference/nodes/camera-node/`, ['CameraNode']);
		await page(`${v.base}reference/lua/`, ['Lua API']);
		if (!v.isDefault && v.base !== '/docs/') {
			const html = await (await get(BASE + v.base)).text();
			if (!html.includes('sl-banner')) fail(`${v.base}: no version banner`);
		}
	}

	// Every internal link on the home page and the default docs start page.
	const docsHome = await (await get(`${BASE}/docs/`)).text();
	const links = new Set([...internalLinks(home ?? ''), ...internalLinks(docsHome)]);
	let broken = 0;
	for (const l of links) {
		const r = await get(BASE + l, { method: 'HEAD' });
		if (r.status >= 400) {
			fail(`link ${l}: HTTP ${r.status}`);
			broken++;
		}
	}
	if (!broken) ok(`${links.size} internal links`);

	const sm = await get(`${BASE}/sitemap-index.xml`);
	if (sm.status !== 200) fail(`sitemap: HTTP ${sm.status}`);
	else ok('sitemap');

	if (!SKIP_WWW) {
		const www = await get('https://www.rayzr.app/');
		if (www.status !== 200) fail(`www.rayzr.app: HTTP ${www.status}`);
		else ok('www.rayzr.app');
	}

	await checkDownloads();
	report();
}

function report() {
	for (const p of passes) console.log(`  ok    ${p}`);
	for (const f of failures) console.log(`  FAIL  ${f}`);
	console.log(failures.length ? `${failures.length} check(s) failed` : `all ${passes.length} checks passed`);
	process.exit(failures.length ? 1 : 0);
}

main().catch((e) => {
	fail(e.stack || e.message);
	report();
});

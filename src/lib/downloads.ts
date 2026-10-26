// The download page's content from the downloads manifest (written by the
// engine's scripts/ci/publish_r2.py, https://downloads.rayzr.app/manifest.json).
// renderDownloads() is used at build time and again in the browser with the
// live manifest, so a release published after the last site build shows up.

export interface DownloadFile {
	name: string;
	os: 'macos' | 'windows' | 'linux' | 'any';
	arch: string;
	kind: string;
	label: string;
	size: number;
	sha256: string;
	url: string;
}

export interface DownloadEntry {
	version: string;
	tag: string;
	channel: 'stable' | 'dev';
	prerelease: boolean;
	date: string;
	commit: string;
	notes_url: string;
	files: DownloadFile[];
}

export interface DownloadsManifest {
	schema: number;
	updated: string | null;
	base_url: string;
	latest: string | null;
	stable: DownloadEntry[];
	dev: DownloadEntry | null;
}

export const MANIFEST_URL = 'https://downloads.rayzr.app/manifest.json';

const OS_ORDER = ['macos', 'windows', 'linux'] as const;
const osRank = (os: string) => {
	const i = OS_ORDER.indexOf(os as (typeof OS_ORDER)[number]);
	return i < 0 ? OS_ORDER.length : i; // (checksums last)
};
const OS_NAME: Record<string, string> = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

export function formatSize(bytes: number): string {
	if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

export function formatDate(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const esc = (s: string) =>
	String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The entry the big buttons offer: the latest full release, else the newest. */
export function primaryEntry(m: DownloadsManifest): DownloadEntry | null {
	return m.stable.find((e) => e.version === m.latest) ?? m.stable[0] ?? m.dev ?? null;
}

/** "macos" / "windows" / "linux" from a user agent (null: unknown, phones). */
export function detectOS(userAgent: string): 'macos' | 'windows' | 'linux' | null {
	const ua = userAgent.toLowerCase();
	if (/iphone|ipad|android/.test(ua)) return null;
	if (ua.includes('mac')) return 'macos';
	if (ua.includes('win')) return 'windows';
	if (ua.includes('linux') || ua.includes('x11')) return 'linux';
	return null;
}

function primaryFile(e: DownloadEntry, os: string): DownloadFile | undefined {
	const prefer = { macos: ['dmg'], windows: ['zip'], linux: ['appimage', 'deb', 'tar.gz'] }[os] ?? [];
	for (const k of prefer) {
		const f = e.files.find((x) => x.os === os && x.kind === k);
		if (f) return f;
	}
	return e.files.find((x) => x.os === os);
}

function fileTable(e: DownloadEntry): string {
	const rows = e.files
		.slice()
		.sort((a, b) => osRank(a.os) - osRank(b.os))
		.map(
			(f) =>
				`<tr><td><a href="${esc(f.url)}" data-download="${esc(f.name)}">${esc(f.label)}</a><div class="rz-file">${esc(f.name)}</div></td>` +
				`<td class="rz-num">${f.kind === 'checksums' ? '' : formatSize(f.size)}</td>` +
				`<td><code class="rz-sha" title="SHA-256">${esc(f.sha256.slice(0, 16))}…</code></td></tr>`,
		)
		.join('');
	return `<table class="rz-files"><thead><tr><th>File</th><th>Size</th><th>SHA-256</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function entrySection(e: DownloadEntry, title: string, open: boolean): string {
	const kind = e.channel === 'dev' ? 'Development build' : e.prerelease ? 'Pre-release' : 'Release';
	return (
		`<details class="rz-release" data-version="${esc(e.version)}"${open ? ' open' : ''}>` +
		`<summary><span class="rz-release__title">${esc(title)}</span> <span class="rz-badge rz-badge--${e.channel}">${kind}</span>` +
		` <span class="rz-release__date">${formatDate(e.date)}</span></summary>` +
		fileTable(e) +
		`<p class="rz-release__links"><a href="${esc(e.notes_url)}">Release notes</a>` +
		(e.commit ? ` · commit <code>${esc(e.commit.slice(0, 7))}</code>` : '') +
		'</p></details>'
	);
}

/** The whole download section (HTML). */
export function renderDownloads(m: DownloadsManifest): string {
	const primary = primaryEntry(m);
	if (!primary) {
		return (
			'<div class="rz-downloads rz-downloads--empty"><p>No builds are published yet. ' +
			'Follow the <a href="https://github.com/bcrowe306/rayzr/releases">GitHub releases</a> for the first one.</p></div>'
		);
	}
	const buttons = OS_ORDER.map((os) => {
		const f = primaryFile(primary, os);
		if (!f) return '';
		return (
			`<a class="rz-dl-button" data-os="${os}" href="${esc(f.url)}" data-download="${esc(f.name)}">` +
			`<span class="rz-dl-button__os">${OS_NAME[os]}</span><span class="rz-dl-button__meta">${esc(f.label)} · ${formatSize(f.size)}</span></a>`
		);
	}).join('');
	const heading =
		primary.channel === 'dev'
			? `Latest development build: ${esc(primary.version)}`
			: `Rayzr ${esc(primary.version)}${primary.prerelease ? ' (pre-release)' : ''}`;
	const sections: string[] = [];
	m.stable.forEach((e, i) => sections.push(entrySection(e, `Rayzr ${e.version}`, i === 0)));
	if (m.dev && m.dev !== primary) sections.push(entrySection(m.dev, `Development build ${m.dev.version}`, m.stable.length === 0));
	else if (m.dev) sections.push(entrySection(m.dev, `Development build ${m.dev.version}`, true));
	return (
		`<div class="rz-downloads" data-updated="${esc(m.updated ?? '')}">` +
		`<p class="rz-downloads__heading">${heading} <span class="rz-release__date">${formatDate(primary.date)}</span></p>` +
		`<div class="rz-dl-buttons">${buttons}</div>` +
		`<h2 id="all-builds">All builds</h2>` +
		`<p class="rz-downloads__note">The site keeps the three newest releases and the latest development build. ` +
		`Older ones are on <a href="https://github.com/bcrowe306/rayzr/releases">GitHub</a>.</p>` +
		sections.join('') +
		'</div>'
	);
}

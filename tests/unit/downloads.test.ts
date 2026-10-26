import { describe, expect, it } from 'vitest';
import { detectOS, formatDate, formatSize, primaryEntry, renderDownloads, type DownloadsManifest } from '../../src/lib/downloads';

const file = (name: string, os: string, kind: string, label: string, size = 1000) => ({
	name, os, kind, label, size, arch: 'x64', sha256: 'a'.repeat(64), url: `https://downloads.rayzr.app/x/${name}`,
}) as never;
const entry = (version: string, channel: 'stable' | 'dev' = 'stable', prerelease = false) => ({
	version, tag: `v${version}`, channel, prerelease, date: '2026-10-25T12:00:00+00:00', commit: 'abcdef1234567',
	notes_url: `https://github.com/bcrowe306/rayzr/releases/tag/v${version}`,
	files: [
		file('SHA256SUMS.txt', 'any', 'checksums', 'SHA-256 checksums', 400),
		file(`rayzr-editor-${version}-linux.tar.gz`, 'linux', 'tar.gz', 'Linux tarball (x64)'),
		file(`rayzr-editor-${version}-linux-x86_64.AppImage`, 'linux', 'appimage', 'Linux AppImage (x64)', 50 * 1024 * 1024),
		file(`rayzr-editor-${version}-macos.dmg`, 'macos', 'dmg', 'macOS (Apple silicon)', 80 * 1024 * 1024),
		file(`rayzr-editor-${version}-windows.zip`, 'windows', 'zip', 'Windows (x64)'),
	],
});
const manifest = (over: Partial<DownloadsManifest> = {}): DownloadsManifest => ({
	schema: 1, updated: '2026-10-25T12:00:00+00:00', base_url: 'https://downloads.rayzr.app', latest: null, stable: [], dev: null, ...over,
});

describe('helpers', () => {
	it('formats sizes and dates', () => {
		expect(formatSize(512)).toBe('512 B');
		expect(formatSize(2048)).toBe('2 KB');
		expect(formatSize(80 * 1024 * 1024)).toBe('80.0 MB');
		expect(formatSize(3 * 1024 ** 3)).toBe('3.0 GB');
		expect(formatDate('2026-10-25T12:00:00+00:00')).toBe('2026-10-25');
		expect(formatDate('nope')).toBe('');
	});
	it('detects the OS', () => {
		expect(detectOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
		expect(detectOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
		expect(detectOS('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
		expect(detectOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBeNull();
		expect(detectOS('Mozilla/5.0 (Linux; Android 14)')).toBeNull();
	});
	it('offers the latest full release first, then dev', () => {
		expect(primaryEntry(manifest())).toBeNull();
		expect(primaryEntry(manifest({ dev: entry('0.2.0-dev.3', 'dev', true) }))?.version).toBe('0.2.0-dev.3');
		const m = manifest({ latest: '0.1.0', stable: [entry('0.2.0-beta.1', 'stable', true), entry('0.1.0')], dev: entry('0.2.0-dev.3', 'dev', true) });
		expect(primaryEntry(m)?.version).toBe('0.1.0');
	});
});

describe('renderDownloads', () => {
	it('says so when nothing is published', () => {
		expect(renderDownloads(manifest())).toContain('No builds are published yet');
	});
	it('renders a button per OS with the preferred package', () => {
		const html = renderDownloads(manifest({ latest: '0.1.0', stable: [entry('0.1.0')] }));
		expect(html).toContain('data-os="macos"');
		expect(html).toContain('rayzr-editor-0.1.0-macos.dmg');
		expect(html).toContain('data-os="windows"');
		// (Linux: the AppImage over the tarball.)
		expect(html).toMatch(/data-os="linux" href="[^"]*AppImage"/);
		expect(html).toContain('80.0 MB');
	});
	it('lists every release and the dev build with checksums last', () => {
		const html = renderDownloads(manifest({ latest: '0.2.0', stable: [entry('0.2.0'), entry('0.1.0')], dev: entry('0.3.0-dev.9', 'dev', true) }));
		expect(html).toContain('data-version="0.2.0" open');
		expect(html).toContain('data-version="0.1.0"');
		expect(html).toContain('Development build 0.3.0-dev.9');
		const rows = [...html.matchAll(/data-download="([^"]+)"/g)].map((m) => m[1]);
		const firstTable = rows.slice(3, 8); // (after the 3 buttons)
		expect(firstTable.at(-1)).toBe('SHA256SUMS.txt');
	});
	it('escapes what it prints', () => {
		const bad = entry('0.1.0');
		bad.notes_url = 'https://x/"><script>alert(1)</script>';
		const html = renderDownloads(manifest({ latest: '0.1.0', stable: [bad] }));
		expect(html).not.toContain('<script>');
	});
});

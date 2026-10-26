import { primaryEntry, type DownloadsManifest } from './downloads';
export { manifest } from './site-data';

/** The version the Download button offers ("v0.1.0", "dev build"), or "". */
export function primaryEntryVersion(m: DownloadsManifest): string {
	const e = primaryEntry(m);
	if (!e) return '';
	return e.channel === 'dev' ? `dev ${e.version}` : `v${e.version}`;
}

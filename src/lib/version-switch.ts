// Where the docs version picker goes: the same page in the other version
// when it has it, else that version's start page.
export interface SwitchVersion {
	id: string;
	base: string;
	slugs: string[];
}

export function targetPath(pathname: string, fromId: string, toId: string, versions: SwitchVersion[]): string {
	const from = versions.find((v) => v.id === fromId);
	const to = versions.find((v) => v.id === toId);
	if (!to) return pathname;
	if (!from || !pathname.startsWith(from.base)) return to.base;
	const slug = pathname.slice(from.base.length).replace(/\/$/, '');
	if (slug === '' || to.slugs.includes(slug)) return to.base + (slug ? `${slug}/` : '');
	return to.base;
}

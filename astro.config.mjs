// @ts-check
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// The docs sidebars come from `npm run sync` (scripts/sync.mjs): one group
// per documentation version, unwrapped per page by src/routeData.ts.
const SITE_JSON = new URL('./src/generated/site.json', import.meta.url);
const site = fs.existsSync(SITE_JSON) ? JSON.parse(fs.readFileSync(SITE_JSON, 'utf8')) : { sidebar: [] };
if (!site.sidebar.length) console.warn('[rayzr] no docs: run `npm run sync` first');

export default defineConfig({
	site: 'https://rayzr.app',
	trailingSlash: 'always',
	integrations: [
		starlight({
			title: 'Rayzr',
			description: 'Rayzr: a 2D game engine and editor. Scenes and nodes, live-reloading Lua, an LDtk level editor, skeletal animation, an audio mixer - export to macOS, Windows, Linux and the web.',
			logo: { src: './src/assets/rayzr-logo.png', alt: 'Rayzr', replacesTitle: false },
			favicon: '/favicon.png',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/bcrowe306/rayzr' },
				{ icon: 'email', label: 'Email', href: 'mailto:support@rayzr.app' },
			],
			customCss: ['./src/styles/custom.css'],
			lastUpdated: true,
			head: [
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://rayzr.app/og.png' } },
				{ tag: 'meta', attrs: { name: 'theme-color', content: '#0b0b0d' } },
			],
			components: {
				Sidebar: './src/components/Sidebar.astro',
				Header: './src/components/Header.astro',
				Footer: './src/components/Footer.astro',
				PageTitle: './src/components/PageTitle.astro',
			},
			routeMiddleware: './src/routeData.ts',
			sidebar: site.sidebar,
			expressiveCode: { themes: ['github-dark-default', 'github-light-default'] },
			plugins: [starlightLinksValidator({ errorOnLocalLinks: false, exclude: ['/download/', '/features/', '/contact/'] })],
		}),
	],
});

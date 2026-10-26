# rayzr.app

The website and documentation of [Rayzr](https://github.com/bcrowe306/rayzr),
a 2D game engine and editor: **https://rayzr.app**. Built with
[Astro](https://astro.build) and [Starlight](https://starlight.astro.build),
hosted on Cloudflare Pages; downloads are served from Cloudflare R2 at
`downloads.rayzr.app`.

| Page | What |
|---|---|
| `/` | The landing page (`src/content/docs/index.mdx`, `src/components/Landing*.astro`) |
| `/features/` | Every feature, from the engine's `docs/features.json` |
| `/download/` | The builds in the downloads manifest (3 releases + the latest dev build) |
| `/contact/` | Contact and contributing |
| `/docs/` | The documentation of the latest release; older releases at `/docs/v<version>/`, the dev build at `/docs/dev/` |
| `/site-info.json` | What this deployment contains (used by the deploy check) |

## How it stays in sync

The documentation is written in the **engine** repository, next to the code
(`docs/`, `engine/docs/`, the Lua definitions, the node registry...). This
repository holds only the site around it.

```
engine repo                                    this repo
-----------                                    ---------
tag v0.2.0 / merge to main
  └─ release.yml: build every platform
       ├─ GitHub Release
       ├─ scripts/ci/publish_r2.py ──────────► R2: releases/v0.2.0/*, dev/v*/*,
       │    (keep 3 releases + 1 dev)               manifest.json
       └─ calls .github/workflows/site.yml ──► npm run sync
                                                 ├─ reads manifest.json
                                                 ├─ for each version: sparse checkout of
                                                 │  the engine at its tag (dev: main), runs
                                                 │  its scripts/docs/export_site.py
                                                 └─ pages -> src/content/docs/docs/<prefix>/
                                               astro build (links validated) + tests
                                               wrangler pages deploy -> rayzr.app
                                               scripts/verify-deploy.mjs (live checks)
```

- **Versions** (`scripts/lib/versions.mjs`): the manifest's releases (at
  most 3) and the dev build. The latest full release is the default
  (`/docs/`); until the first release, the dev build is.
- **Each version's docs are built by that version's own exporter**, so the
  engine can change its docs layout without breaking older versions.
- **Per-version sidebars**: the Starlight config holds one sidebar group per
  version; `src/routeData.ts` shows a page only its own version's group and
  keeps previous / next inside it. The picker at the top of the sidebar
  (`src/components/VersionSelect.astro`) keeps the page when the other
  version has it.
- **Downloads** are rendered from the manifest at build time and refreshed
  in the browser from the live manifest (`src/lib/downloads.ts`), so a build
  published after the last deploy still shows up.
- **Annotated screenshots** come from the engine's editor test drives
  (`annotate` lines write `<shot>.annotations.json`); the exporter turns
  them into numbered callouts that `src/styles/custom.css` draws over the
  image.

## Develop

Needs Node 22.23.4+ (CI uses 24), Python 3, git.

```sh
npm ci
npm run sync          # the manifest + every version's docs from GitHub (.cache/)
npm run dev           # http://localhost:4321
```

Previewing doc changes from a local engine checkout:

```sh
ENGINE_DIR=../rayzr npm run sync                 # your checkout as the dev version
ENGINE_DIR=../rayzr ENGINE_DIR_FOR_ALL=1 \
  MANIFEST_URL=https://downloads.rayzr.app/ci-test/manifest.json npm run sync
                                                  # every version from it (try the picker)
```

`npm run sync` options (environment): `MANIFEST_URL`, `ENGINE_REPO`,
`ENGINE_DIR`, `ENGINE_DIR_FOR_ALL`, `DEV_REF`, `PYTHON` - see the top of
`scripts/sync.mjs`.

## Test

```sh
npm test              # unit tests (vitest): versions, the picker, downloads, sync
npm run check         # astro check (TypeScript)
npx astro build       # also validates every internal link (starlight-links-validator)
npx playwright test   # end-to-end on the built site (desktop + mobile)
npm run verify        # checks the live site (or --url <preview>)
```

## Deploy

`.github/workflows/site.yml` does it all - build, test, deploy with
`wrangler pages deploy`, then `scripts/verify-deploy.mjs` against the live
site (waiting until `/site-info.json` reports the new build). It runs on
pushes to `main`, daily, by hand (Actions > Site > Run workflow), and from
the engine's release workflow after every build. Pull requests get a preview
URL that is verified too.

By hand (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`):

```sh
npm run sync && SITE_BUILD_ID=manual-$(date +%s) npx astro build
npm run deploy
npm run verify -- --expect-build <the same id>
```

## Infrastructure

| | |
|---|---|
| Cloudflare Pages project | `rayzr-website` (direct upload), custom domains `rayzr.app`, `www.rayzr.app` |
| DNS (zone rayzr.app) | `rayzr.app` and `www` CNAME `rayzr-website.pages.dev` (proxied); the zone's Email Routing records are separate |
| R2 bucket | `rayzr-downloads`, public at `downloads.rayzr.app`, CORS for rayzr.app; `ci-test/` holds test data (a fake manifest for previews) |
| Email | `support@rayzr.app` (Cloudflare Email Routing) |
| GitHub secrets (here and in bcrowe306/rayzr) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; the engine also has `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

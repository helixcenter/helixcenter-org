# helixcenter-org

Eleventy source for [helixcenter.org](https://www.helixcenter.org), deployed to Netlify (project `helixcenter`).

## Build

```bash
npm install
npm run build         # outputs to _site/
npx @11ty/eleventy --serve   # local dev
```

`npm run build` runs `npx @11ty/eleventy` and minifies CSS/JS.

## Deploy

Netlify build is configured in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `_site`
- Security headers (HSTS, X-Frame-Options, Referrer-Policy, etc.) applied to all routes

To enable Git-driven deploys, link this repo in the Netlify dashboard for project `helixcenter` (site-id `0135b2d7-1eeb-4a5c-9b70-d722d74ef154`) under *Site settings → Build & deploy → Repository*.

## Layout

- `.eleventy.js` — Eleventy configuration
- `src/_data/` — centralized JSON data (speakers, roundtables, institutions, podcasts, governance, etc.)
- `src/_includes/` — Nunjucks layouts and partials
- `src/pages/` — top-level pages
- `src/speakers/`, `src/roundtables/`, `src/institutions/`, `src/commentaries/`, `src/blog/` — paginated collection templates
- `src/css/`, `src/js/`, `src/img/`, `src/downloads/` — assets
- `src/feed.njk`, `src/sitemap.njk`, `src/robots.txt`, `src/llms.txt`, `src/llms-full.txt`, `src/_headers`, `src/pages/404.njk` — site-level files

## Related repos

- [`helix-center-website`](https://github.com/jon-chun/helix-center-website) — QA test harness and content-authoring guidelines
- [`helix-center-website-main`](https://github.com/jon-chun/helix-center-website-main) — full archive of project history

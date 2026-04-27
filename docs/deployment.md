# Deployment

The published site is a static bundle (HTML, CSS, JS, images) — anywhere that can serve files will work. This repo is set up for **Cloudflare Pages**, which gives unlimited bandwidth on the free tier and pairs naturally with Cloudflare Access for the email-OTP gate.

---

## Cloudflare Pages

In the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, point it at this repo. Then under **Settings → Builds & deployments → Build configuration**:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | (empty) |
| Environment variables | `NODE_VERSION=22` |

Save and trigger a redeploy. Every push to the configured branch (and every pull request) will build automatically; PRs get their own preview URL.

> **Heads-up:** Cloudflare's auto-detect runs `npx <framework> build`. If the project was previously something else (e.g. Quartz) and you migrated to Astro, the dashboard may still have the old command cached — make sure it's set to `npm run build` explicitly.

`npm run build` chains `astro build && pagefind --site dist`, so the search index is generated as part of the same build. No separate step.

---

## Cloudflare Access (email-OTP gate)

The whole point of this setup is that the source vault stays private and the published mirror is gated to a small allowlist. Configure that in **Zero Trust → Access → Applications → Add an application → Self-hosted**:

1. **Application domain**: the hostname your Pages site is served on (custom domain or `*.pages.dev`).
2. **Identity provider**: enable the built-in **One-time PIN** provider (sends a 6-digit code by email).
3. **Policy**: allow specific email addresses or `@yourcompany.com` domains.

Anyone hitting the site is redirected to a Cloudflare-hosted login screen, enters their email, receives a code, and gets a session cookie that's valid for whatever you set the session lifetime to (default 24h).

Cost: $0 up to 50 users on the free Zero Trust plan.

---

## Custom domain

In **Pages → Custom domains → Set up a custom domain**, point your domain at the project. Cloudflare provisions the cert automatically. Update [`astro.config.ts`](../astro.config.ts) to match — `site:` controls canonical URLs in the sitemap and meta tags:

```ts
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://your-domain.example',
  ...
});
```

You can override per environment by setting `SITE_URL` in the Cloudflare Pages env vars (handy for preview deploys).

---

## Local preview of the production build

```bash
npm run build
npm run preview   # serves dist/ at http://localhost:4321/
```

This is the closest local approximation to what Cloudflare will serve.

---

## Environment variables

See [`.env.schema`](../.env.schema) for the documented variables. Most are optional; only `SITE_URL` (or letting it default to the value in `astro.config.ts`) matters in production.

| Variable | Purpose |
|---|---|
| `SITE_URL` | Canonical URL used in the sitemap and meta tags |
| `OBSIDIAN_VAULT_DIR` | Override the default `content/` vault path |
| `SITE_TITLE` | Override the default "My Vault" site title |
| `SITE_DESCRIPTION` | Default `<meta name="description">` |

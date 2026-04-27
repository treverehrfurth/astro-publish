import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Set SITE_URL to your deployed canonical URL (e.g. https://example.com).
// The fallback below is a placeholder used only for sitemap and OG meta
// generation when SITE_URL is unset; replace it before deploying.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://example.com',
  integrations: [mdx(), sitemap()],
  markdown: {
    syntaxHighlight: false,
  },
  vite: {
    ssr: {
      noExternal: ['d3-force', 'd3-selection', 'd3-zoom'],
    },
  },
});

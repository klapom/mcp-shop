// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://shop.pommerconsulting.de',

  vite: {
    plugins: [tailwindcss()],
    preview: {
      // CF-Tunnel-fronted access (shop.pommerconsulting.de + ephemeral
      // *.trycloudflare.com URLs). Vite default blocks foreign Host headers
      // (DNS-rebind protection). For the static-shop preview that's
      // overkill — the dist/ contains no secrets and we sit behind CF Access
      // via the tunnel anyway.
      allowedHosts: true,
    },
  },

  image: {
    remotePatterns: [{ protocol: 'https' }],
  },

  integrations: [sitemap()],
});
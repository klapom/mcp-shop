// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://shop.pommerconsulting.de',

  vite: {
    plugins: [tailwindcss()],
  },

  image: {
    remotePatterns: [{ protocol: 'https' }],
  },

  integrations: [sitemap()],
});
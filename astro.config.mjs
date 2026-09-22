// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages: https://shota-ando-s.github.io/myworld-timeline
export default defineConfig({
  site: 'https://shota-ando-s.github.io',
  base: '/myworld-timeline',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});

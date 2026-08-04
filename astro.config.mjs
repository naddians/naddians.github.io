// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Адрес сайта. При переезде на свой домен меняется ТОЛЬКО здесь:
//   site: 'https://example.com', base: '/'
export default defineConfig({
  site: 'https://naddians.github.io',
  base: '/',
  trailingSlash: 'always',
  build: { format: 'directory' },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'sr'],
    routing: { prefixDefaultLocale: false },
  },

  image: {
    // Ширины, которые генерируются для каждого кадра. Наружу максимум 2000px —
    // это и есть «ограничение размера» из ТЗ §8.
    responsiveStyles: false,
  },

  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', sr: 'sr-Latn' },
      },
    }),
  ],
});

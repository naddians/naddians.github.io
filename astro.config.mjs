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
    responsiveStyles: false,

    // Качество сжатия для картинок, которые Astro готовит из наших JPEG.
    // По умолчанию AVIF жмётся на 50 из 100 — на мелкой фактуре (трава, сетка,
    // толпа, мелкий шрифт на болиде) это видно как грязь, особенно на большом
    // экране. 72 — заметно чище, файл при этом примерно в полтора раза тяжелее.
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        avif: { quality: 72 },
        webp: { quality: 82 },
        jpeg: { quality: 82 },
      },
    },
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

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Адрес сайта. При переезде на свой домен меняется ТОЛЬКО здесь:
//   site: 'https://example.com', base: '/'
export default defineConfig({
  site: 'https://naddians.photo',
  base: '/',
  trailingSlash: 'always',
  build: { format: 'directory' },

  // Сборка обязана оставлять в стилях префиксы `-webkit-`, которые Safari
  // ещё требует. По умолчанию минификатор считал их лишними и выбрасывал:
  // `-webkit-user-select: none` в просмотрщике исчезал, и на телефоне кадр
  // выделялся синим, хотя правило в исходнике стояло (F1_P77).
  vite: { build: { cssTarget: ['safari16', 'chrome108', 'firefox110'] } },

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
    // Обработчик свой (src/utils/imageService.ts): всё как у Astro, плюс
    // кадрирование по точке кадра в процентах — без него шапка раздела
    // скачивалась целиком ради узкой полосы (F1_P33).
    service: {
      entrypoint: './src/utils/imageService.ts',
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

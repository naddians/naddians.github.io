/** Разделы с фотографиями. Порядок тот же, что в src/data/site.ts. */
export const GALLERIES = ['track', 'people', 'atmosphere', 'beyond'] as const;

/** Все страницы сайта в обоих языках. Адреса со слешом на конце: trailingSlash: 'always'. */
export const PAGES = [
  '/',
  '/track/',
  '/people/',
  '/atmosphere/',
  '/beyond/',
  '/about/',
  '/contact/',
  '/license/',
  '/sr/',
  '/sr/track/',
  '/sr/people/',
  '/sr/atmosphere/',
  '/sr/beyond/',
  '/sr/about/',
  '/sr/contact/',
  '/sr/license/',
];

/**
 * Ширины окна, на которых меняется раскладка галереи (см. global.css):
 * до 640 — один столбец, 640–1023 и от 1024 — ряды равной высоты, но разрезы
 * у них свои (.grid__break--mid и .grid__break--wide).
 */
export const PHONE = { width: 375, height: 812 };
export const NARROW = { width: 320, height: 812 };
export const TABLET = { width: 900, height: 1000 };
export const DESKTOP = { width: 1440, height: 1000 };

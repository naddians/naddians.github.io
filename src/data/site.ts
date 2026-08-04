// Факты, одинаковые для обоих языков. Тексты — в src/i18n/*.json.

export const CONTACTS = {
  email: 'nadiastelmashuk@gmail.com',
  telegram: 'naddians',
  instagram: 'nadd1ans',
} as const;

/** Отснятые события. Сгруппированы по уик-эндам — так видно два выезда, а не пять строк. */
export const EVENTS = [
  {
    venue: 'Spa-Francorchamps',
    year: 2026,
    series: ['Formula 1', 'Formula 2', 'Porsche Mobil 1 Supercup'],
  },
  {
    venue: 'Silverstone',
    year: 2025,
    series: ['Formula 1', 'Formula 2'],
  },
] as const;

/** Коллаборации. Заголовок блока — «Collaborations», не «Publications» (ТЗ §3.1 п.6). */
export const COLLABS = [
  { handle: 'mclaren_fans_serbia' },
  { handle: 'formula1srbija' },
] as const;

export const GEAR = 'Canon R7 · RF 100-400mm f/5.6-8 · Sigma 17-40mm f/1.8 DC Art';

/**
 * Разделы-галереи. `slug` = имя папки в src/photos/ и кусок URL.
 * ВРЕМЕННЫЕ названия — заказчица пришлёт свои (CONTENT.md §3).
 * Меняется здесь + в src/i18n/*.json, папка переименовывается следом.
 */
export const GALLERIES = ['track', 'portraits', 'atmosphere'] as const;

export type GallerySlug = (typeof GALLERIES)[number];

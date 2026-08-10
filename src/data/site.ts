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
export const GALLERIES = ['track', 'people', 'atmosphere'] as const;

export type GallerySlug = (typeof GALLERIES)[number];

/**
 * Обложки: из них при сборке режется картинка 1200×630 для превью ссылки
 * в мессенджерах и соцсетях (ТЗ §10). Путь — относительно src/photos/.
 * Поменять обложку = поменять имя файла здесь.
 */
export const COVERS: Record<string, string> = {
  '': 'hero.jpg',
  track: 'track/020-on-track.jpg',
  people: 'people/070-people.jpg',
  atmosphere: 'atmosphere/020-circuit.jpg',
  about: 'about/portrait.jpg',
  contact: 'hero.jpg',
};

/**
 * Какая часть обложки видна в шапке раздела. Шапка — узкая полоса во всю ширину,
 * поэтому от вертикального кадра в неё попадает только середина по высоте.
 * Первое число — сдвиг по горизонтали, второе по вертикали: 50% — центр,
 * 0% — верх кадра, 100% — низ. Раздела нет в списке = берётся центр.
 * У On-Track и Circuit сюжет ниже середины кадра: без сдвига в полосу попадали
 * реклама на отбойнике и пустая трибуна вместо болида и людей.
 */
export const COVER_FOCUS: Record<string, string> = {
  track: '50% 74%',
  people: '50% 40%',
  atmosphere: '50% 58%',
};

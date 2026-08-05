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
 * Витрина на главной — ручной отбор, а не «первые из каждой галереи»:
 * там подряд шли похожие кадры одной съёмки. Здесь собраны самые резкие
 * и максимально разные по крупности плана — общий план, панорама, пэннинг,
 * деталь машины, портрет, репортаж. Порядок чередует типы кадров.
 * Убрать или добавить строку = поменять витрину.
 */
export const FEATURED: string[] = [
  'track/010-on-track.jpg', // нос болида крупно, пилот в кокпите
  'atmosphere/080-circuit.jpg', // общий план трассы с трибунами
  'people/040-people.jpg', // портрет пилота
  'track/090-on-track.jpg', // Mercedes крупно, пэннинг, размытый фон
  'people/140-people.jpg', // шампанское на подиуме
  'atmosphere/040-circuit.jpg', // трасса в лесу, панорама
  'track/050-on-track.jpg', // пэннинг у отбойника
  'people/070-people.jpg', // пилот под зонтом, дождь
  'atmosphere/050-circuit.jpg', // пелотон на Eau Rouge, телефоны на трибуне
  'people/100-people.jpg', // пилоты и фотографы, репортаж
  'track/100-on-track.jpg', // пэннинг на прямой
  'people/120-people.jpg', // подиум, трое пилотов
];

/**
 * Запасной вариант: если FEATURED пуст, витрина берёт первые N кадров
 * каждой галереи. Так она не ломается, если список забыли обновить.
 */
export const FEATURED_PER_GALLERY = 5;

/**
 * Обложки: из них при сборке режется картинка 1200×630 для превью ссылки
 * в мессенджерах и соцсетях (ТЗ §10). Путь — относительно src/photos/.
 * Поменять обложку = поменять имя файла здесь.
 */
export const COVERS: Record<string, string> = {
  '': 'hero.jpg',
  track: 'track/140-on-track.jpg',
  people: 'people/120-people.jpg',
  atmosphere: 'atmosphere/080-circuit.jpg',
  about: 'about/portrait.jpg',
  contact: 'hero.jpg',
};

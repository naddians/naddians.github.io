import { BEYOND_SERIES, type GallerySlug } from '../data/site';

export interface Photo {
  alt: string;
  image: ImageMetadata;
}

/** Группа кадров внутри раздела: серия и её кадры (BEYOND_SERIES в site.ts). */
export interface PhotoGroup {
  slug: string;
  title: string;
  photos: Photo[];
}

// Единственное место, где читается папка с фотографиями. Всё её содержимое
// попадает на сайт автоматически — это и есть «положить файл и запушить» (ТЗ §7).
const MODULES = import.meta.glob<{ default: ImageMetadata }>(
  '/src/photos/**/*.{jpg,jpeg,png,JPG,JPEG,PNG}',
  { eager: true },
);

/** «10-spa-2026-eau-rouge.jpg» → «Spa 2026 eau rouge». Подписи не видны, это alt (ТЗ §6). */
function altFromPath(path: string): string {
  const file = path.split('/').pop() ?? '';
  const text = file
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «010-porsche.jpg» → «porsche». Хвост имени = имя подпапки в inbox/. */
function slugFromPath(path: string): string {
  const file = path.split('/').pop() ?? '';
  return file.replace(/\.[^.]+$/, '').replace(/^\d+[-_]/, '').toLowerCase();
}

/** Кадры одной галереи в порядке префикса NN- в имени файла. */
export function photosIn(gallery: GallerySlug): Photo[] {
  return Object.entries(MODULES)
    .filter(([path]) => path.startsWith(`/src/photos/${gallery}/`))
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([path, mod]) => ({ alt: altFromPath(path), image: mod.default }));
}

/**
 * Разделы, которые показываются не одной лентой, а группами с заголовками.
 * Пока такой один — Beyond F1, где группа = серия (site.ts, BEYOND_SERIES).
 */
const GROUPED: Partial<Record<GallerySlug, readonly { slug: string; title: string }[]>> = {
  beyond: BEYOND_SERIES,
};

/**
 * Кадры раздела, разложенные по группам. Группа узнаётся по имени файла:
 * `010-porsche.jpg` → `porsche`; это имя ставит scripts/photos.mjs по имени
 * подпапки в inbox/. Порядок групп — как в BEYOND_SERIES, порядок внутри —
 * как в обычной галерее, по номеру в имени файла. Пустые группы не возвращаются:
 * серия, к которой ещё нет кадров, на странице не появляется.
 * Кадр, положенный в раздел без подпапки, серии не имеет — он уедет в конец
 * группой без заголовка.
 */
export function groupsIn(gallery: GallerySlug): PhotoGroup[] {
  const series = GROUPED[gallery];
  if (!series) return [];

  const buckets = new Map(series.map((item) => [item.slug, [] as Photo[]]));
  const loose: Photo[] = [];

  for (const [path, mod] of Object.entries(MODULES).sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (!path.startsWith(`/src/photos/${gallery}/`)) continue;
    const slug = slugFromPath(path);
    const bucket = buckets.get(slug);
    const title = series.find((item) => item.slug === slug)?.title;
    (bucket ?? loose).push({ alt: title ?? altFromPath(path), image: mod.default });
  }

  const groups = series
    .map((item) => ({ ...item, photos: buckets.get(item.slug) ?? [] }))
    .filter((group) => group.photos.length > 0);

  return loose.length > 0 ? [...groups, { slug: '', title: '', photos: loose }] : groups;
}

/** Один кадр по точному пути, например 'hero.jpg' или 'about/portrait.jpg'. */
export function photoAt(relativePath: string): ImageMetadata | undefined {
  return MODULES[`/src/photos/${relativePath}`]?.default;
}

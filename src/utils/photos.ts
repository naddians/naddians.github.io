import { type GallerySlug } from '../data/site';

export interface Photo {
  alt: string;
  image: ImageMetadata;
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

/** Кадры одной галереи в порядке префикса NN- в имени файла. */
export function photosIn(gallery: GallerySlug): Photo[] {
  return Object.entries(MODULES)
    .filter(([path]) => path.startsWith(`/src/photos/${gallery}/`))
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([path, mod]) => ({ alt: altFromPath(path), image: mod.default }));
}

/** Один кадр по точному пути, например 'hero.jpg' или 'about/portrait.jpg'. */
export function photoAt(relativePath: string): ImageMetadata | undefined {
  return MODULES[`/src/photos/${relativePath}`]?.default;
}

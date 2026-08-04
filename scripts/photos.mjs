/**
 * Готовит фотографии для сайта.
 *
 *   npm run photos
 *
 * Берёт что угодно из папки inbox/ — любые имена, любой размер — и раскладывает
 * по src/photos/ уже уменьшенным, пронумерованным и переименованным.
 * Папка inbox/ в репозиторий не попадает, там лежат твои оригиналы.
 */
import sharp from 'sharp';
import { readdir, mkdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INBOX = path.join(ROOT, 'inbox');
const PHOTOS = path.join(ROOT, 'src', 'photos');

/**
 * ТЗ §7: качество 85, меньше исходника не увеличиваем.
 * Длинная сторона 1600px (решение заказчицы 2026-08-04, было 2560): репозиторий
 * публичный, поэтому в нём лежит ровно то, что нужно сайту, и ни пикселя сверх.
 * Наружу сайт отдаёт максимум 1200px в галереях и 1600px в герое — на вид разницы нет.
 */
const MAX_SIDE = 1600;
const QUALITY = 85;
const STEP = 10;

const COPYRIGHT = '© Nadia Stelmashuk';
const ARTIST = 'Nadia Stelmashuk';

const GALLERIES = [
  { inbox: 'track', out: path.join(PHOTOS, 'track'), label: 'on track' },
  { inbox: 'people', out: path.join(PHOTOS, 'people'), label: 'people' },
  { inbox: 'atmosphere', out: path.join(PHOTOS, 'atmosphere'), label: 'circuit' },
];

const SINGLES = [
  { inbox: 'hero', out: path.join(PHOTOS, 'hero.jpg') },
  { inbox: 'portrait', out: path.join(PHOTOS, 'about', 'portrait.jpg') },
];

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
/** Приставки, которые камеры ставят сами. */
const CAMERA_PREFIX = /^(img|dscf|dscn|dsc|mg|gopr|dji)[-_]?/i;
/** Хвосты, которые появляются при копировании файлов и смысла не несут. */
const NOISE = /\b(copy|kopiya|final|edit|edited|export|web|small|large|\d+)\b/gi;

/**
 * Осмысленное ли имя файла. `spa-2026-eau-rouge` — да, `001a2466-2` и `IMG_4821` — нет.
 * Проверка простая: остаётся ли хоть одно слово из трёх букв, когда убрали
 * приставку камеры, цифры и служебные хвосты.
 */
function isGenericName(bare) {
  const cleaned = slugify(bare)
    .replace(CAMERA_PREFIX, '')
    .replace(/-/g, ' ')
    .replace(NOISE, '')
    .trim();
  return !/[a-z]{3,}/.test(cleaned);
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Рекурсивно собирает файлы. Имя подпапки становится описанием кадра. */
async function collect(dir, base = '') {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collect(full, base ? `${base}-${entry.name}` : entry.name)));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED.has(ext)) {
      console.warn(`  ⚠ пропускаю ${entry.name} — формат ${ext} не поддерживается`);
      continue;
    }

    files.push({ full, name: entry.name, group: base });
  }

  return files;
}

/**
 * Порядок в галерее: свежее — первым. Так на главную попадают последние съёмки,
 * а не самые старые. Поставь false, чтобы шли от старых к новым.
 */
const NEWEST_FIRST = true;

/** Порядок = время съёмки. Если его нет — по имени файла (камера нумерует подряд). */
async function sortByCaptureTime(files) {
  const withTime = await Promise.all(
    files.map(async (file) => {
      let taken = null;
      try {
        const meta = await sharp(file.full).metadata();
        const raw = meta.exif ? parseExifDate(meta.exif) : null;
        taken = raw ?? (await stat(file.full)).mtime.getTime();
      } catch {
        taken = (await stat(file.full)).mtime.getTime();
      }
      return { ...file, taken };
    }),
  );

  const direction = NEWEST_FIRST ? -1 : 1;
  return withTime.sort(
    (a, b) => direction * (a.taken - b.taken || a.name.localeCompare(b.name, 'en')),
  );
}

/** Достаёт дату съёмки из блока EXIF без лишних зависимостей. */
function parseExifDate(buffer) {
  const match = buffer
    .toString('latin1')
    .match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`).getTime();
}

async function convert(source, target) {
  const image = sharp(source, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

  // fit: 'inside' ограничивает длинную сторону независимо от ориентации.
  // Задавать ширину или высоту по отдельности нельзя: metadata() отдаёт размеры
  // до поворота по EXIF, и у повёрнутых кадров ограничивалась короткая сторона —
  // длинная тогда уезжала до 3840px вместо 2560.
  const pipeline = image
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .withMetadata({ exif: { IFD0: { Copyright: COPYRIGHT, Artist: ARTIST } } })
    .toFile(target);

  return { resized: longest > MAX_SIDE, from: longest };
}

/** Удаляет только то, что скрипт сгенерировал раньше. Заглушки _demo не трогает. */
async function clearGenerated(dir) {
  if (!existsSync(dir)) return;
  for (const name of await readdir(dir)) {
    if (/^\d+-.*\.jpg$/i.test(name) && !name.includes('_demo')) {
      await unlink(path.join(dir, name));
    }
  }
}

async function processGallery(gallery) {
  const inboxDir = path.join(INBOX, gallery.inbox);
  const files = await sortByCaptureTime(await collect(inboxDir));

  if (files.length === 0) {
    console.log(`inbox/${gallery.inbox}/ — пусто, пропускаю`);
    return 0;
  }

  console.log(`\ninbox/${gallery.inbox}/ — ${files.length} шт.`);
  await mkdir(gallery.out, { recursive: true });
  await clearGenerated(gallery.out);

  let index = 0;
  for (const file of files) {
    index += STEP;
    const number = String(index).padStart(3, '0');

    const bare = path.basename(file.name, path.extname(file.name));
    const described = file.group || (isGenericName(bare) ? gallery.label : bare);
    const target = path.join(gallery.out, `${number}-${slugify(described)}.jpg`);

    const result = await convert(file.full, target);
    console.log(
      `  ${file.name} → ${path.basename(target)}` +
        (result.resized ? `  (${result.from}px → ${MAX_SIDE}px)` : '  (размер оставлен)'),
    );
  }

  return files.length;
}

async function processSingle(single) {
  const inboxDir = path.join(INBOX, single.inbox);
  const files = await sortByCaptureTime(await collect(inboxDir));

  if (files.length === 0) {
    console.log(`inbox/${single.inbox}/ — пусто, пропускаю`);
    return 0;
  }

  if (files.length > 1) {
    console.warn(`  ⚠ в inbox/${single.inbox}/ несколько файлов, беру первый`);
  }

  await mkdir(path.dirname(single.out), { recursive: true });
  const result = await convert(files[0].full, single.out);
  console.log(
    `\ninbox/${single.inbox}/ — ${files[0].name} → ${path.relative(ROOT, single.out)}` +
      (result.resized ? `  (${result.from}px → ${MAX_SIDE}px)` : ''),
  );
  return 1;
}

async function main() {
  if (!existsSync(INBOX)) {
    console.error(
      'Папки inbox/ нет.\n' +
        'Создай её и положи внутрь папки track, people, atmosphere, hero, portrait.',
    );
    process.exit(1);
  }

  let total = 0;
  for (const gallery of GALLERIES) total += await processGallery(gallery);
  for (const single of SINGLES) total += await processSingle(single);

  console.log(`\nГотово: обработано ${total} фотографий.`);
  if (total > 0) {
    console.log('Посмотреть:  npm run dev');
    console.log('Опубликовать: git add . && git commit -m "фото" && git push');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

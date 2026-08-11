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
import { readdir, mkdir, unlink, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INBOX = path.join(ROOT, 'inbox');
const PHOTOS = path.join(ROOT, 'src', 'photos');

/**
 * Ручной порядок кадров (scripts/order.json). Нужен там, где галерея должна идти
 * не по времени съёмки, а по силе кадров: сильные сверху.
 * Файл лежит в репозитории, а не в inbox/, — иначе порядок терялся бы вместе с
 * папкой оригиналов, которая живёт только на компьютере автора.
 */
const ORDER_FILE = path.join(ROOT, 'scripts', 'order.json');
const MANUAL_ORDER = existsSync(ORDER_FILE)
  ? JSON.parse(await readFile(ORDER_FILE, 'utf8'))
  : {};

/**
 * ТЗ §7: качество 85, меньше исходника не увеличиваем.
 * Длинная сторона 1600px (решение заказчицы 2026-08-04, было 2560): репозиторий
 * публичный, поэтому в нём лежит ровно то, что нужно сайту, и ни пикселя сверх.
 * Наружу сайт отдаёт максимум 1200px в галереях — на вид разницы нет.
 * Исключение — кадры-обложки, им нужен запас: см. COVER_WIDTH ниже.
 */
const MAX_SIDE = 1600;
const QUALITY = 85;
const STEP = 10;

/**
 * Кадры-обложки (COVERS в src/data/site.ts) живут по другим правилам: они стоят
 * шапкой во всю ширину экрана, поэтому им важна ШИРИНА файла, а не длинная
 * сторона. Широкий монитор — это 2000–3000 точек по ширине, а на ретине вдвое
 * больше; кадр в 1600px там растягивается втрое и превращается в мыло.
 * 3400px закрывает и 27-дюймовый 5K. В галерее эти же файлы отдаются мелкими,
 * как все остальные, — лишние пиксели никто не качает.
 */
const COVER_WIDTH = 3400;
const SITE_FILE = path.join(ROOT, 'src', 'data', 'site.ts');

/** Читает список обложек прямо из site.ts, чтобы он не разъезжался с сайтом. */
async function readCovers() {
  const block = (await readFile(SITE_FILE, 'utf8')).match(/COVERS[^=]*=\s*{([^}]*)}/);
  const covers = new Set(
    [...(block?.[1] ?? '').matchAll(/['"]([^'"]+\.(?:jpe?g|png))['"]/gi)].map((m) =>
      m[1].toLowerCase(),
    ),
  );
  if (covers.size === 0) {
    console.warn('⚠ не нашёл COVERS в src/data/site.ts — сохраню обложки обычного размера');
  }
  return covers;
}

/**
 * Серии раздела Beyond F1 — читаются из того же site.ts, что и обложки, чтобы
 * список не разъезжался с сайтом. Порядок здесь = порядок групп на странице.
 */
async function readSeries() {
  const block = (await readFile(SITE_FILE, 'utf8')).match(/BEYOND_SERIES[^=]*=\s*\[([\s\S]*?)\]/);
  return [...(block?.[1] ?? '').matchAll(/slug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Путь файла так, как он записан в COVERS: относительно src/photos/. */
function coverKey(target) {
  return path.relative(PHOTOS, target).split(path.sep).join('/').toLowerCase();
}

const COPYRIGHT = '© Nadia Stelmashuk';
const ARTIST = 'Nadia Stelmashuk';

const GALLERIES = [
  { inbox: 'track', out: path.join(PHOTOS, 'track'), label: 'on track' },
  { inbox: 'people', out: path.join(PHOTOS, 'people'), label: 'people' },
  { inbox: 'atmosphere', out: path.join(PHOTOS, 'atmosphere'), label: 'circuit' },
  // Единственный раздел с группами: кадры лежат по подпапкам-сериям
  // (inbox/beyond/porsche/, inbox/beyond/f2/), и имя подпапки уезжает в имя
  // файла — по нему сайт и раскладывает кадры по заголовкам.
  { inbox: 'beyond', out: path.join(PHOTOS, 'beyond'), label: 'beyond f1', grouped: true },
];

const SINGLES = [
  { inbox: 'hero', out: path.join(PHOTOS, 'hero.jpg') },
  { inbox: 'portrait', out: path.join(PHOTOS, 'about', 'portrait.jpg') },
  { inbox: '404', out: path.join(PHOTOS, '404.jpg') },
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

/**
 * Переставляет кадры по списку из order.json. Что в списке — идёт первым и в
 * заданном порядке, остальное падает в конец, сохраняя порядок по времени съёмки.
 * Так добавленный кадр не ломает уже выстроенную галерею: он просто окажется
 * последним, пока его не впишут в список.
 */
function applyManualOrder(files, key) {
  const wanted = MANUAL_ORDER[key];
  if (!Array.isArray(wanted) || wanted.length === 0) return files;

  const rank = new Map(wanted.map((name, index) => [name.toLowerCase(), index]));
  const listed = [];
  const rest = [];
  for (const file of files) {
    (rank.has(file.name.toLowerCase()) ? listed : rest).push(file);
  }
  listed.sort((a, b) => rank.get(a.name.toLowerCase()) - rank.get(b.name.toLowerCase()));

  const present = new Set(files.map((file) => file.name.toLowerCase()));
  const missing = wanted.filter((name) => !present.has(name.toLowerCase()));
  if (missing.length > 0) {
    console.warn(`  ⚠ в order.json перечислены файлы, которых нет в inbox/${key}/: ${missing.join(', ')}`);
  }
  if (rest.length > 0) {
    console.log(
      `  ⚠ ${rest.length} кадр(ов) нет в order.json — временно ставлю в конец.\n` +
        `    Место по резкости им даст:  npm run sharpness -- ${key}`,
    );
  }

  return [...listed, ...rest];
}

/**
 * Порядок в разделе с группами (Beyond F1): сначала серии в порядке
 * BEYOND_SERIES, внутри каждой — свой порядок из order.json по ключу
 * «beyond/porsche». Серии не перемешиваются между собой, а резкость считается
 * внутри серии: npm run sharpness -- beyond/porsche
 */
function applyGroupOrder(files, gallery, series) {
  const ordered = [];
  for (const slug of series) {
    const inGroup = files.filter((file) => slugify(file.group) === slug);
    if (inGroup.length === 0) {
      console.log(`  · серия ${slug} — папки inbox/${gallery.inbox}/${slug}/ нет или она пуста`);
      continue;
    }
    console.log(`  · серия ${slug} — ${inGroup.length} шт.`);
    ordered.push(...applyManualOrder(inGroup, `${gallery.inbox}/${slug}`));
  }

  // Кадр, положенный в inbox/beyond/ мимо подпапок: серии у него нет, на сайте
  // он встанет в конец без заголовка. Молчать об этом нельзя — скорее всего
  // просто забыли папку.
  const loose = files.filter((file) => !series.includes(slugify(file.group)));
  if (loose.length > 0) {
    console.warn(
      `  ⚠ ${loose.length} кадр(ов) лежат в inbox/${gallery.inbox}/ без подпапки-серии:\n` +
        `    ${loose.map((file) => file.name).join(', ')}\n` +
        `    Серии сейчас: ${series.join(', ')} — положи кадр в нужную папку.`,
    );
  }

  return [...ordered, ...loose];
}

async function convert(source, target, { cover = false } = {}) {
  const image = sharp(source, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

  // Обычный кадр: fit: 'inside' ограничивает длинную сторону независимо от
  // ориентации. Задавать ширину или высоту по отдельности нельзя: metadata()
  // отдаёт размеры до поворота по EXIF, и у повёрнутых кадров ограничивалась
  // короткая сторона — длинная тогда уезжала до 3840px вместо 2560.
  // Обложка: ограничиваем только ширину — высота у шапки всё равно обрезается.
  const limit = cover
    ? { width: COVER_WIDTH, withoutEnlargement: true }
    : { width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true };

  const { width, height } = await image
    .resize(limit)
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .withMetadata({ exif: { IFD0: { Copyright: COPYRIGHT, Artist: ARTIST } } })
    .toFile(target);

  return { resized: longest > Math.max(width, height), from: longest, to: `${width}×${height}` };
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

async function processGallery(gallery, covers, series) {
  const inboxDir = path.join(INBOX, gallery.inbox);
  const found = await sortByCaptureTime(await collect(inboxDir));

  if (found.length === 0) {
    console.log(`inbox/${gallery.inbox}/ — пусто, пропускаю`);
    return 0;
  }

  console.log(`\ninbox/${gallery.inbox}/ — ${found.length} шт.`);
  const files = gallery.grouped
    ? applyGroupOrder(found, gallery, series)
    : applyManualOrder(found, gallery.inbox);
  await mkdir(gallery.out, { recursive: true });
  await clearGenerated(gallery.out);

  let index = 0;
  for (const file of files) {
    index += STEP;
    const number = String(index).padStart(3, '0');

    const bare = path.basename(file.name, path.extname(file.name));
    const described = file.group || (isGenericName(bare) ? gallery.label : bare);
    const target = path.join(gallery.out, `${number}-${slugify(described)}.jpg`);

    const isCover = covers.has(coverKey(target));
    const result = await convert(file.full, target, { cover: isCover });
    console.log(
      `  ${file.name} → ${path.basename(target)}` +
        (result.resized ? `  (${result.from}px → ${result.to})` : '  (размер оставлен)') +
        (isCover ? '  ← обложка раздела, храним крупнее' : ''),
    );
  }

  return files.length;
}

async function processSingle(single, covers) {
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
  const isCover = covers.has(coverKey(single.out));
  const result = await convert(files[0].full, single.out, { cover: isCover });
  console.log(
    `\ninbox/${single.inbox}/ — ${files[0].name} → ${path.relative(ROOT, single.out)}` +
      (result.resized ? `  (${result.from}px → ${result.to})` : ''),
  );
  return 1;
}

async function main() {
  if (!existsSync(INBOX)) {
    console.error(
      'Папки inbox/ нет.\n' +
        'Создай её и положи внутрь папки track, people, atmosphere, beyond, hero, portrait, 404.\n' +
        'В beyond/ кадры лежат ещё на этаж глубже, по сериям: beyond/porsche/, beyond/f2/.',
    );
    process.exit(1);
  }

  const covers = await readCovers();
  const series = await readSeries();

  let total = 0;
  for (const gallery of GALLERIES) total += await processGallery(gallery, covers, series);
  for (const single of SINGLES) total += await processSingle(single, covers);

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

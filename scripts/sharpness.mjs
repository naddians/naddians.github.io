/**
 * Расставляет кадры в галерее по резкости ГЛАВНОГО ОБЪЕКТА.
 *
 *   npm run sharpness -- atmosphere           — посчитать раздел и собрать лист
 *   npm run sharpness -- atmosphere --apply   — записать порядок в order.json
 *
 * Раздел называется всегда. Пересчёт тасует галерею целиком, поэтому считаем
 * только тот раздел, который сейчас меняем: у остальных порядок уже выстроен
 * и трогать его нечего.
 *
 * Без `--apply` скрипт ничего не меняет: он считает, рисует контрольный лист
 * в sharpness/ и печатает таблицу. Порядок уезжает в order.json только когда
 * лист посмотрели и согласились — метрика ошибается, и молча пускать её
 * на сайт нельзя (см. «Где метрика врёт» ниже).
 *
 * Зачем главный объект, а не кадр целиком: на проводке фон размыт намеренно,
 * и резкость по всему кадру занижает как раз лучшие кадры. Раньше рамку болида
 * задавали руками — здесь скрипт ищет её сам, а лист нужен, чтобы проверить,
 * куда он её поставил.
 *
 * Где метрика врёт (проверено на этих галереях):
 *  — мелкая фактура толпы, сетки и гравия читается как резкость;
 *  — тёмный кадр получает меньшую амплитуду краёв, чем светлый той же резкости
 *    (лечится растяжкой контраста перед замером, см. normalise() ниже);
 *  — размытый фон вокруг резкого объекта тянет оценку вниз, если рамка
 *    захватила лишнее.
 * Поэтому на листе рядом с каждым кадром нарисована найденная рамка: видно,
 * что именно скрипт посчитал главным объектом.
 */
import sharp from 'sharp';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INBOX = path.join(ROOT, 'inbox');
const ORDER_FILE = path.join(ROOT, 'scripts', 'order.json');
const SHEET_DIR = path.join(ROOT, 'sharpness');

const SUPPORTED = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

/** Одиночные кадры — не галереи, порядок им не нужен. */
const SINGLES = new Set(['hero', 'portrait', '404']);

/**
 * Что можно считать: папки галерей в inbox/. Список не записан руками, а
 * читается с диска — новая серия в Beyond F1 появляется просто созданием папки.
 * Раздел с подпапками (inbox/beyond/) считается по частям: каждая серия отдельно,
 * `beyond/porsche`, — порядок нужен внутри серии, а не поперёк них.
 */
async function listGalleries() {
  const targets = [];
  for (const entry of await readdir(INBOX, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SINGLES.has(entry.name)) continue;
    const nested = (await readdir(path.join(INBOX, entry.name), { withFileTypes: true })).filter(
      (sub) => sub.isDirectory() && !sub.name.startsWith('.'),
    );
    if (nested.length > 0) targets.push(...nested.map((sub) => `${entry.name}/${sub.name}`));
    else targets.push(entry.name);
  }
  return targets;
}

/** Ширина рабочей копии, на которой ищем объект. Больше — медленнее, точнее не становится. */
const WORK_WIDTH = 1400;
/** Сколько клеток по горизонтали в сетке поиска. */
const GRID_X = 32;
/**
 * Клетка считается «резкой», если её оценка не ниже этой доли от лучшей клетки
 * кадра. Ниже порог — рамка растёт и захватывает фон, выше — рамка сжимается
 * до одной блестящей детали.
 */
const SHARP_TILE = 0.55;
/**
 * Рамка шире этой доли кадра = объект не найден. Ровно та поломка, из-за которой
 * рамки раньше ставили руками: на проводке автопоиск брал весь кадр.
 */
const TOO_WIDE = 0.7;
/**
 * Найденную рамку приводим к одной ширине, и только потом меряем. Без этого
 * выигрывал бы просто крупный план: у объекта во весь кадр деталей больше
 * по определению, а не потому что он резче.
 */
const NORM_WIDTH = 1000;
/**
 * Меряем не «сколько в кадре фактуры», а «насколько остры самые сильные края»:
 * берём верхние 5% откликов. Средняя по всем точкам как раз и есть та метрика,
 * которая принимает толпу за резкость.
 */
const TOP_SHARE = 0.05;

/* ── метрика ───────────────────────────────────────────────────────────── */

/**
 * Радиус окна, в котором проверяется связность края. Примерно толщина линии,
 * по которой мы отличаем борт болида от ряби толпы.
 */
const COHERENCE_R = 3;

/**
 * Карта краёв: сила края, умноженная на его связность.
 *
 * Просто «сила края» — это та самая метрика, которая принимает толпу за
 * резкость: у зрителей, листвы и сетки мелких перепадов яркости больше, чем
 * на гладком борту машины. Разница в том, что у борта перепады выстроены
 * в линию и смотрят в одну сторону, а у толпы — в разные.
 *
 * Считается так: в окне вокруг точки складываются направления градиента
 * (структурный тензор), и из него берётся связность — 1, когда все края
 * смотрят одинаково, 0, когда вразнобой. Толпа получает высокую силу,
 * но низкую связность, и в сумме проигрывает.
 */
function edgeMap(data, w, h) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] =
        data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1] -
        data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1];
      gy[i] =
        data[i + w - 1] + 2 * data[i + w] + data[i + w + 1] -
        data[i - w - 1] - 2 * data[i - w] - data[i - w + 1];
    }
  }

  const xx = new Float32Array(w * h);
  const yy = new Float32Array(w * h);
  const xy = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    xx[i] = gx[i] * gx[i];
    yy[i] = gy[i] * gy[i];
    xy[i] = gx[i] * gy[i];
  }
  for (const plane of [xx, yy, xy]) boxBlur(plane, w, h, COHERENCE_R);

  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const trace = xx[i] + yy[i];
    if (trace <= 0) continue;
    const diff = xx[i] - yy[i];
    const spread = Math.sqrt(diff * diff + 4 * xy[i] * xy[i]);
    const coherence = spread / trace; // 0 — вразнобой, 1 — одна линия
    out[i] = Math.sqrt(trace) * coherence;
  }
  return out;
}

/** Усреднение по квадратному окну, двумя проходами: сначала строки, потом столбцы. */
function boxBlur(plane, w, h, r) {
  const tmp = new Float32Array(w * h);
  const window = 2 * r + 1;

  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += plane[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / window;
      sum -= plane[row + Math.min(w - 1, Math.max(0, x - r))];
      sum += plane[row + Math.min(w - 1, Math.max(0, x + r + 1))];
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      plane[y * w + x] = sum / window;
      sum -= tmp[Math.min(h - 1, Math.max(0, y - r)) * w + x];
      sum += tmp[Math.min(h - 1, Math.max(0, y + r + 1)) * w + x];
    }
  }
}

/** Среднее по верхним TOP_SHARE значений. Пустой набор — ноль. */
function topMean(values) {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  const take = Math.max(1, Math.round(sorted.length * TOP_SHARE));
  let sum = 0;
  for (let i = sorted.length - take; i < sorted.length; i++) sum += sorted[i];
  return sum / take;
}

/** Оценка каждой клетки сетки — карта резкости кадра. */
function tileScores(lap, w, h, tile) {
  const cols = Math.ceil(w / tile);
  const rows = Math.ceil(h / tile);
  const scores = new Float32Array(cols * rows);

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const values = [];
      const x1 = Math.min(w, (tx + 1) * tile);
      const y1 = Math.min(h, (ty + 1) * tile);
      for (let y = ty * tile; y < y1; y++) {
        for (let x = tx * tile; x < x1; x++) values.push(lap[y * w + x]);
      }
      scores[ty * cols + tx] = topMean(values);
    }
  }
  return { scores, cols, rows };
}

/**
 * Ищет главный объект: самое большое связное пятно резких клеток.
 * Толпа и сетка дают резкие клетки по всему кадру, но они рассыпаны;
 * болид или человек — это компактное пятно.
 */
function findSubject({ scores, cols, rows }) {
  let max = 0;
  for (const value of scores) if (value > max) max = value;
  if (max === 0) return null;

  const threshold = max * SHARP_TILE;
  const seen = new Uint8Array(cols * rows);
  let best = null;

  for (let start = 0; start < scores.length; start++) {
    if (seen[start] || scores[start] < threshold) continue;

    // Обход в ширину: собираем одно связное пятно целиком.
    const queue = [start];
    seen[start] = 1;
    let weight = 0;
    let minX = cols;
    let maxX = -1;
    let minY = rows;
    let maxY = -1;

    while (queue.length > 0) {
      const index = queue.pop();
      const x = index % cols;
      const y = (index - x) / cols;
      weight += scores[index];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const next = ny * cols + nx;
        if (seen[next] || scores[next] < threshold) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }

    if (!best || weight > best.weight) best = { weight, minX, maxX, minY, maxY };
  }

  if (!best) return null;

  // Клетка по краю пятна обычно наполовину фон — берём один шаг запаса.
  const box = {
    x: Math.max(0, best.minX - 1) / cols,
    y: Math.max(0, best.minY - 1) / rows,
    w: (Math.min(cols - 1, best.maxX + 1) - Math.max(0, best.minX - 1) + 1) / cols,
    h: (Math.min(rows - 1, best.maxY + 1) - Math.max(0, best.minY - 1) + 1) / rows,
  };
  box.sure = box.w * box.h <= TOO_WIDE;
  return box;
}

/** Считает кадр: находит объект и меряет резкость его краёв. */
async function analyze(file) {
  const image = sharp(file, { failOn: 'none' }).rotate();
  const { data, info } = await image
    .clone()
    .greyscale()
    .resize({ width: WORK_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tile = Math.max(8, Math.round(info.width / GRID_X));
  const lap = edgeMap(data, info.width, info.height);
  const box = findSubject(tileScores(lap, info.width, info.height, tile)) ?? {
    x: 0, y: 0, w: 1, h: 1, sure: false,
  };

  // Меряем на оригинале, а не на рабочей копии: уменьшение само по себе
  // подтягивает резкость и сближает кадры, которые на деле разные.
  const meta = await image.metadata();
  const full = { width: meta.width ?? 0, height: meta.height ?? 0 };
  // metadata() отдаёт размеры до поворота по EXIF — у повёрнутых кадров меняем местами.
  const rotated = (meta.orientation ?? 1) >= 5;
  const W = rotated ? full.height : full.width;
  const H = rotated ? full.width : full.height;

  const crop = {
    left: Math.round(box.x * W),
    top: Math.round(box.y * H),
    width: Math.max(16, Math.round(box.w * W)),
    height: Math.max(16, Math.round(box.h * H)),
  };
  crop.width = Math.min(crop.width, W - crop.left);
  crop.height = Math.min(crop.height, H - crop.top);

  const { data: cropData, info: cropInfo } = await image
    .clone()
    .extract(crop)
    .greyscale()
    // Растяжка контраста: иначе тёмный кадр проигрывает светлому той же резкости.
    .normalise()
    .resize({ width: NORM_WIDTH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const score = topMean(edgeMap(cropData, cropInfo.width, cropInfo.height));
  return { score, box };
}

/* ── порядок ───────────────────────────────────────────────────────────── */

/**
 * Собирает итоговый порядок: кадры идут по резкости, но закреплённые встают
 * ровно на свои места. Закреп — это ваш выбор, метрика его не двигает.
 */
function buildOrder(ranked, pins) {
  const pinned = new Map();
  for (const [name, place] of Object.entries(pins ?? {})) {
    const found = ranked.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!found) {
      console.warn(`  ⚠ закреплён кадр ${name}, но его нет в inbox — пропускаю`);
      continue;
    }
    // Отрицательное место — отсчёт с конца: -1 последний, -2 предпоследний.
    const index = place < 0 ? ranked.length + place : place - 1;
    pinned.set(Math.max(0, Math.min(ranked.length - 1, index)), found);
  }

  const rest = ranked.filter((item) => ![...pinned.values()].includes(item));
  const result = new Array(ranked.length).fill(null);
  for (const [index, item] of pinned) result[index] = item;

  let cursor = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) result[i] = rest[cursor++];
  }
  return result.filter(Boolean);
}

/* ── контрольный лист ──────────────────────────────────────────────────── */

const CELL = 430;
const PAD = 16;
const LABEL = 34;
const COLS = 3;

async function buildSheet(gallery, order, dir) {
  const rows = Math.ceil(order.length / COLS);
  const width = COLS * CELL + (COLS + 1) * PAD;
  const height = rows * (CELL + LABEL) + (rows + 1) * PAD;
  const layers = [];

  for (const [i, item] of order.entries()) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CELL + PAD);
    const y = PAD + row * (CELL + LABEL + PAD);

    const thumb = sharp(path.join(dir, item.name), { failOn: 'none' }).rotate();
    const buf = await thumb
      .resize(CELL, CELL, { fit: 'contain', background: { r: 10, g: 10, b: 10 } })
      .toBuffer();
    layers.push({ input: buf, left: x, top: y });

    // Рамка рисуется поверх вписанного кадра, поэтому считаем поля от вписывания.
    const meta = await sharp(buf).metadata();
    const shot = await thumb.metadata();
    const ratio = (shot.orientation ?? 1) >= 5
      ? (shot.height ?? 1) / (shot.width ?? 1)
      : (shot.width ?? 1) / (shot.height ?? 1);
    const drawW = ratio >= 1 ? CELL : CELL * ratio;
    const drawH = ratio >= 1 ? CELL / ratio : CELL;
    const offX = (CELL - drawW) / 2;
    const offY = (CELL - drawH) / 2;

    const b = item.box;
    const color = b.sure ? '#3ddc84' : '#ffa53d';
    const overlay = `<svg width="${CELL}" height="${CELL}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${offX + b.x * drawW}" y="${offY + b.y * drawH}"
            width="${b.w * drawW}" height="${b.h * drawH}"
            fill="none" stroke="${color}" stroke-width="3"/>
    </svg>`;
    layers.push({ input: Buffer.from(overlay), left: x, top: y });

    const note = b.sure ? '' : '  ⚠ объект не найден';
    const caption = `${i + 1}. ${item.name} — ${item.score.toFixed(1)}${item.pinned ? '  📌 закреп' : ''}${note}`;
    const text = `<svg width="${CELL}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="22" font-family="Helvetica, Arial" font-size="18"
            fill="${item.pinned ? '#4da3ff' : b.sure ? '#c8c8c8' : '#ffa53d'}">${caption}</text>
    </svg>`;
    layers.push({ input: Buffer.from(text), left: x, top: y + CELL + 4 });
    void meta;
  }

  await mkdir(SHEET_DIR, { recursive: true });
  // «beyond/porsche» → «beyond-porsche.jpg»: лист лежит одним файлом, без папок.
  const out = path.join(SHEET_DIR, `${gallery.replace(/\//g, '-')}.jpg`);
  await sharp({ create: { width, height, channels: 3, background: { r: 10, g: 10, b: 10 } } })
    .composite(layers)
    .jpeg({ quality: 88 })
    .toFile(out);
  return out;
}

/* ── запуск ────────────────────────────────────────────────────────────── */

async function processGallery(gallery, order) {
  const dir = path.join(INBOX, gallery);
  if (!existsSync(dir)) {
    console.log(`inbox/${gallery}/ — нет папки, пропускаю`);
    return null;
  }

  const names = (await readdir(dir)).filter(
    (name) => !name.startsWith('.') && SUPPORTED.has(path.extname(name).toLowerCase()),
  );
  if (names.length === 0) {
    console.log(`inbox/${gallery}/ — пусто, пропускаю`);
    return null;
  }

  console.log(`\ninbox/${gallery}/ — ${names.length} кадр(ов), считаю резкость объекта…`);
  const measured = [];
  for (const name of names) {
    const { score, box } = await analyze(path.join(dir, name));
    measured.push({ name, score, box });
    process.stdout.write(`  ${name} — ${score.toFixed(1)}${box.sure ? '' : '  ⚠ объект не найден'}\n`);
  }

  measured.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'en'));
  const pins = order.pins?.[gallery] ?? {};
  const final = buildOrder(measured, pins);
  for (const item of final) {
    item.pinned = Object.keys(pins).some((n) => n.toLowerCase() === item.name.toLowerCase());
  }

  console.log(`\n  порядок для ${gallery}:`);
  for (const [i, item] of final.entries()) {
    console.log(
      `   ${String(i + 1).padStart(2)}. ${item.name.padEnd(20)} ${item.score.toFixed(1).padStart(7)}` +
        `${item.pinned ? '  закреп' : ''}${item.box.sure ? '' : '  ⚠ объект не найден'}`,
    );
  }

  const sheet = await buildSheet(gallery, final, dir);
  console.log(`  лист: ${path.relative(ROOT, sheet)}`);
  return final.map((item) => item.name);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const galleries = args.filter((a) => !a.startsWith('--'));

  // Раздел называется всегда, «пересчитать всё» тут нет намеренно: пересчёт
  // тасует галерею целиком, и делать это разделу, который сейчас не трогаем,
  // незачем — только терять уже выстроенный порядок.
  const known = await listGalleries();

  if (galleries.length === 0) {
    console.error('Скажи, какой раздел считаем:  npm run sharpness -- <раздел>');
    console.error(`Разделы: ${known.join(', ')}`);
    process.exit(1);
  }

  for (const gallery of galleries) {
    if (!known.includes(gallery)) {
      console.error(`Не знаю галерею «${gallery}». Есть: ${known.join(', ')}`);
      process.exit(1);
    }
  }

  const order = JSON.parse(await readFile(ORDER_FILE, 'utf8'));
  const results = {};
  for (const gallery of galleries) {
    const list = await processGallery(gallery, order);
    if (list) results[gallery] = list;
  }

  if (!apply) {
    console.log('\nПосмотри листы в sharpness/ — там рамкой обведено то, что скрипт');
    console.log('счёл главным объектом. Порядок пока никуда не записан.');
    console.log(`Записать:  npm run sharpness -- ${galleries.join(' ')} --apply`);
    console.log('И потом:   npm run photos');
    return;
  }

  for (const [gallery, list] of Object.entries(results)) order[gallery] = list;
  await writeFile(ORDER_FILE, `${JSON.stringify(order, null, 2)}\n`, 'utf8');
  console.log(`\nПорядок записан в ${path.relative(ROOT, ORDER_FILE)}.`);
  console.log('Теперь перенумеровать кадры:  npm run photos');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Как одна и та же обложка кадрируется в двух разных рамках: карточка раздела
// на главной — прямоугольник 5×4, шапка раздела — узкая полоса во всю ширину.
//
// Раньше сдвиг задавался для каждой рамки отдельно (CARD_FOCUS и COVER_FOCUS
// в site.ts), и один и тот же кадр выглядел на главной и в разделе по-разному.
// Теперь число одно — CARD_FOCUS, оно описывает карточку, а сдвиг для полосы
// считается отсюда: берём середину того, что видно в карточке, и наводим на неё
// полосу. Сюжет оказывается в том же месте кадра, хотя рамки разной формы.

/** Пропорции рамок. Карточка — `aspect-ratio: 5 / 4` в global.css. */
export const CARD_ASPECT = 5 / 4;

/**
 * Шапка раздела тянется во всю ширину, высота у неё фиксированная (460px,
 * `.hero--section` в global.css) — на компьютере это полоса примерно 2.8:1.
 * На телефоне она почти квадратная, но там в неё и так входит почти весь кадр,
 * и сдвиг ничего не решает: считаем по компьютеру.
 */
export const HERO_ASPECT = 1280 / 460;

/** «50% 100%» → [0.5, 1]. Нет строки — центр. */
function parse(focus: string | undefined): [number, number] {
  const [x, y] = (focus ?? '50% 50%').split(/\s+/).map((part) => parseFloat(part) / 100);
  return [Number.isFinite(x) ? x : 0.5, Number.isFinite(y) ? y : 0.5];
}

/**
 * Пересчёт сдвига с одной рамки на другую по одной оси.
 * `value` — object-position в исходной рамке (0 — край, 1 — противоположный),
 * `from`/`to` — какая доля кадра видна в каждой рамке по этой оси.
 * Кадр входит в рамку целиком (доля 1) — двигать нечего, остаётся центр.
 */
function reframe(value: number, from: number, to: number): number {
  const center = value * (1 - from) + from / 2;
  if (to >= 1) return 0.5;
  return Math.min(1, Math.max(0, (center - to / 2) / (1 - to)));
}

/**
 * object-position для кадра в рамке `boxAspect`, дающий ту же видимую часть
 * кадра, что и `focus` в рамке `focusAspect` — по умолчанию в карточке 5×4.
 *
 * Рамка-источник задаётся отдельно, потому что сдвиг приходит из двух мест:
 * у разделов это карточка на главной (CARD_FOCUS), а у шапок со своим кадром —
 * сама полоса (HEADERS в src/data/site.ts).
 */
export function focusFor(
  image: { width: number; height: number },
  boxAspect: number,
  focus?: string,
  focusAspect: number = CARD_ASPECT,
): string {
  const photo = image.width / image.height;
  const [x, y] = parse(focus);
  // Доля кадра, видимая в рамке при object-fit: cover. По одной оси она всегда
  // равна 1 — та сторона кадра, которая упирается в рамку.
  const visible = (box: number): [number, number] => [
    Math.min(1, box / photo),
    Math.min(1, photo / box),
  ];
  const [fromX, fromY] = visible(focusAspect);
  const [boxX, boxY] = visible(boxAspect);

  const px = reframe(x, fromX, boxX) * 100;
  const py = reframe(y, fromY, boxY) * 100;
  return `${px.toFixed(0)}% ${py.toFixed(0)}%`;
}

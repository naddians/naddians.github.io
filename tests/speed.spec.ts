import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PAGES, GALLERIES, PHONE, TABLET, DESKTOP } from './pages';

/**
 * Скорость. Для портфолио с тяжёлыми кадрами она важнее, чем кажется: человек
 * не видит ошибку, он просто закрывает вкладку на третьей секунде (F1_P52).
 *
 * На сайте она продумана — кадры отдаются в avif и webp, у каждого своя лестница
 * ширин с потолком «вдвое больше, чем кадр на экране», `sizes` считается по доле
 * ряда с точностью до пикселя, всё ниже первого экрана ждёт прокрутки (F1_P36,
 * PhotoGrid.astro). Но держалось это ровно так же, как высота шапки до F1_P24, —
 * на честном слове: уедет `lazy`, собьётся `sizes`, попадёт в ленту кадр
 * в восемь мегабайт, и ни один из прежних тестов этого бы не заметил, потому
 * что ряды при этом остались бы ровными.
 *
 * Меряются байты и ширины, а не секунды: время зависит от машины и от сети,
 * тест на него врал бы через раз. Время по живым посетителям — это F1_P52.
 */

/**
 * Числа ниже — потолки, а не эталоны. Тест не следит, чтобы сайт не потяжелел
 * ни на байт (тогда он краснел бы на каждой новой съёмке), он ловит обвал:
 * запас к августу 2026 примерно в полтора раза, и рядом записано, от чего
 * этот запас считался.
 */
const FIRST_SCREEN_PHONE = 550 * 1024; // сейчас худшая — People, 371 КБ
const FIRST_SCREEN_DESKTOP = 900 * 1024; // сейчас худшая — главная, 600 КБ
const ONE_FILE = 450 * 1024; // сейчас самый тяжёлый скачиваемый файл — 267 КБ
const SCRIPTS = 10 * 1024; // сейчас 1,9 КБ — просмотрщик кадра (F1_P77)
const TOO_WIDE = 2.5; // сейчас худший перебор — ×2.11, шаг лестницы 400→800

/** Кадр, а не служебная картинка: фотографии Astro складывает в `_astro`. */
const isPhoto = (url: string) => /\/_astro\/[^/]+\.(avif|webp|jpe?g)$/.test(url);

const kb = (bytes: number) => `${Math.round(bytes / 1024)} КБ`;

/** Вес каждого скачанного файла: адрес → байты. */
function weigh(page: Page) {
  const bytes = new Map<string, number>();
  page.on('response', async (response) => {
    try {
      bytes.set(response.url(), (await response.body()).length);
    } catch {
      // Ответ ушёл вместе со страницей — такие в счёт не идут.
    }
  });
  return bytes;
}

/** Кадры первого экрана дозагрузились: раньше считать байты нечестно. */
async function settled(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => {
    const height = window.innerHeight;
    return [...document.images]
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.top < height && box.bottom > 0 && box.width > 0;
      })
      .every((img) => img.complete);
  });
  await page.waitForTimeout(300);
}

/** Адреса кадров, попавших в первый экран, — тех самых, которых человек ждёт. */
const firstScreen = (page: Page) =>
  page.evaluate(() => {
    const height = window.innerHeight;
    return [...document.images]
      .filter((img) => {
        const box = img.getBoundingClientRect();
        return box.top < height && box.bottom > 0 && box.width > 0;
      })
      .map((img) => img.currentSrc);
  });

/**
 * Первый экран весит столько, сколько человек ждёт до первой картинки: сама
 * страница со стилями плюс кадры, попавшие в окно. Всё, что браузер решил
 * подкачать впрок, в счёт не идёт — иначе число росло бы от каждой новой
 * съёмки, а ждать этого никому не приходится.
 */
for (const path of PAGES) {
  test(`${path} — первый экран не тяжелеет`, async ({ browser }) => {
    const cases = [
      // Плотность 3 и 2 — это настоящие телефон и ноутбук: на них лестница
      // ширин отдаёт файлы вдвое-втрое тяжелее, чем на экране без ретины,
      // и мерить надо по худшему из того, что бывает у людей.
      ['на телефоне', { viewport: PHONE, deviceScaleFactor: 3 }, FIRST_SCREEN_PHONE],
      ['на компьютере', { viewport: DESKTOP, deviceScaleFactor: 2 }, FIRST_SCREEN_DESKTOP],
    ] as const;

    for (const [where, options, budget] of cases) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const bytes = weigh(page);

      await page.goto(path);
      await settled(page);

      const shots = await firstScreen(page);
      const paper = [...bytes].filter(([url]) => !isPhoto(url)).reduce((sum, [, n]) => sum + n, 0);
      const photos = shots.reduce((sum, url) => sum + (bytes.get(url) ?? 0), 0);

      expect(
        paper + photos,
        `${where}: страница ${kb(paper)} + кадров ${shots.length} на ${kb(photos)}`,
      ).toBeLessThan(budget);

      await context.close();
    }
  });
}

/**
 * Тяжёлый кадр может лежать где угодно, не только на первом экране, поэтому
 * лента прокручивается до низа. Ловится тут прежде всего беда с оригиналом:
 * кадр, который почему-то поехал на сайт целиком, весит мегабайты.
 */
for (const slug of GALLERIES) {
  test(`${slug} — ни один кадр не весит слишком много`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
    const page = await context.newPage();
    const bytes = weigh(page);
    const types = new Map<string, string>();
    page.on('response', (response) =>
      types.set(response.url(), (response.headers()['content-type'] ?? '').split(';')[0]),
    );

    await page.goto(`/${slug}/`);
    await settled(page);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y);
        await new Promise((done) => setTimeout(done, 150));
      }
    });
    await page.waitForFunction(() => [...document.images].every((img) => img.complete));

    const shots = [...bytes].filter(([url]) => isPhoto(url));
    expect(shots.length, 'кадры вообще не скачались').toBeGreaterThan(0);

    const heavy = shots
      .filter(([, size]) => size > ONE_FILE)
      .map(([url, size]) => `${url.split('/').pop()} — ${kb(size)}`);
    expect(heavy, `кадры тяжелее ${kb(ONE_FILE)}`).toEqual([]);

    // Старый формат — это лишняя половина веса на ровном месте: JPEG остаётся
    // в разметке запасным вариантом, но скачиваться должен avif или webp.
    const old = shots
      .map(([url]) => `${url.split('/').pop()} — ${types.get(url)}`)
      .filter((line) => !/avif|webp/.test(line));
    expect(old, 'кадры скачались старым форматом').toEqual([]);

    await context.close();
  });
}

/**
 * Браузер не должен качать файл заметно шире, чем кадр на экране: это правило
 * про результат, эталонов в нём нет, и портиться ему нечему. Перебор в полтора
 * раза — обычное дело, лестница ширин ступенчатая (400, потом сразу 800).
 * Перебор в два с половиной — это уже не ступенька, а сломанный `sizes`:
 * без него браузер считает кадр во всю ширину окна и тащит самый большой файл.
 *
 * ВАЖНО про `naturalWidth`: он тут врёт. Для кадра, выбранного из `srcset`
 * по `w`, браузер делит ширину файла на плотность, с которой кадр показан, —
 * на телефоне выходит ровно ширина на экране, будто скачан крошечный файл.
 * Настоящая ширина стоит в самом `srcset` рядом с адресом, её и берём.
 */
const wider = (page: Page, limit: number) =>
  page.evaluate((limit) => {
    const dpr = window.devicePixelRatio;
    const bad: string[] = [];

    for (const img of document.images) {
      const box = img.getBoundingClientRect();
      if (!img.currentSrc || box.width === 0) continue;

      const picture = img.closest('picture');
      const sets = [img, ...(picture ? [...picture.querySelectorAll('source')] : [])]
        .map((el) => el.srcset)
        .filter(Boolean);

      let real = 0;
      for (const set of sets) {
        for (const part of set.split(',')) {
          const [url, descriptor] = part.trim().split(/\s+/);
          if (!url || !descriptor?.endsWith('w')) continue;
          if (img.currentSrc.endsWith(url.split('/').pop()!)) real = parseInt(descriptor, 10);
        }
      }

      const need = Math.round(box.width * dpr);
      if (real && need && real > need * limit) {
        bad.push(`${img.currentSrc.split('/').pop()}: на экране ${need}px, скачан ${real}px`);
      }
    }
    return bad;
  }, limit);

for (const slug of GALLERIES) {
  test(`${slug} — браузер не качает кадры шире, чем нужно`, async ({ browser }) => {
    const cases = [
      ['телефон', { viewport: PHONE, deviceScaleFactor: 1 }],
      ['телефон с ретиной', { viewport: PHONE, deviceScaleFactor: 3 }],
      ['планшет', { viewport: TABLET, deviceScaleFactor: 1 }],
      ['компьютер', { viewport: DESKTOP, deviceScaleFactor: 1 }],
      ['компьютер с ретиной', { viewport: DESKTOP, deviceScaleFactor: 2 }],
    ] as const;

    for (const [where, options] of cases) {
      const context = await browser.newContext(options);
      const page = await context.newPage();
      await page.goto(`/${slug}/`);
      await settled(page);

      expect(await wider(page, TOO_WIDE), `${where}: файл шире экрана больше чем в ${TOO_WIDE} раза`).toEqual([]);

      await context.close();
    }
  });
}

/**
 * Кадры ниже первого экрана ждут прокрутки. Мерится на телефоне — там первый
 * экран самый маленький, а связь самая плохая, и там же дороже всего лишний
 * кадр, скачанный впрок. Пара кадров про запас — это сознательный `eagerCount`
 * из PhotoGrid.astro, чтобы лента не мигала при первом же движении пальца.
 */
for (const path of ['/', ...GALLERIES.map((slug) => `/${slug}/`)]) {
  test(`${path} — кадры ниже первого экрана ждут прокрутки`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 3 });
    const page = await context.newPage();

    await page.goto(path);
    await settled(page);

    const grid = await page.evaluate(() => {
      const height = window.innerHeight;
      const images = [...document.images];
      const seen = (img: HTMLImageElement) => {
        const box = img.getBoundingClientRect();
        return box.top < height && box.bottom > 0;
      };
      return {
        visible: images.filter(seen).length,
        ahead: images.filter((img) => img.loading !== 'lazy').length,
        nameless: images
          .filter((img) => !img.hasAttribute('loading'))
          .map((img) => img.currentSrc.split('/').pop()),
        priority: images[0]?.getAttribute('fetchpriority'),
      };
    });

    expect(grid.nameless, 'кадры без пометки loading — решение забыли принять').toEqual([]);
    expect(
      grid.ahead,
      `качается вперёд ${grid.ahead} кадров, а видно на первом экране ${grid.visible}`,
    ).toBeLessThanOrEqual(grid.visible + 2);
    expect(grid.priority, 'первому кадру не назначен высокий приоритет').toBe('high');

    await context.close();
  });
}

/**
 * На сайт почти не приезжает JS. Свой скрипт один — просмотрщик кадра
 * (F1_P77), 1,9 КБ, и только на страницах разделов; больше на сайте нет
 * ничего. Это главная причина, почему он открывается быстро. Чужой скрипт
 * с чужого сайта — классический способ угробить скорость: он тянется до
 * отрисовки, из другого места и по чужой сети.
 *
 * Считаются и встроенные скрипты, а не только внешние: маленький скрипт Astro
 * кладёт прямо в страницу, и проверка по одному `src` его бы не увидела.
 *
 * Когда дойдут руки до счётчика посещений (F1_P51), тест станет красным —
 * так и задумано: счётчик должен ставиться осознанно, с числом в руках,
 * а не приезжать незаметно вместе с чем-то ещё.
 */
test('на страницы не приезжает JS', async ({ request }) => {
  const outside: string[] = [];
  const heavy: string[] = [];

  for (const path of PAGES) {
    const html = await (await request.get(path)).text();
    let weight = 0;

    for (const [, src] of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      if (/^https?:\/\//.test(src)) {
        outside.push(`${path} → ${src}`);
        continue;
      }
      weight += (await (await request.get(src)).body()).length;
    }

    // Встроенные скрипты. Разметка для робота (ld+json) — не скрипт, её вес
    // считается отдельно и в другом тесте.
    for (const [tag, body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (tag.includes('application/ld+json') || tag.includes('src=')) continue;
      weight += Buffer.byteLength(body);
    }

    if (weight > SCRIPTS) heavy.push(`${path} — ${kb(weight)}`);
  }

  expect(outside, 'скрипт с чужого сайта').toEqual([]);
  expect(heavy, `скриптов на странице больше чем на ${kb(SCRIPTS)}`).toEqual([]);
});

import { test, expect } from '@playwright/test';
import { PHONE, DESKTOP } from './pages';
import { BEYOND_SERIES } from '../src/data/site';

/**
 * Адреса серий внутри Beyond F1 (F1_P78). Проверяется то, ради чего они
 * заводились: по адресу вида /beyond/#f2 страница открывается сразу на нужной
 * серии, и этот адрес сам встаёт в адресную строку, когда до серии долистали, —
 * копируешь то, что видишь, как в Википедии.
 *
 * Отдельно проверяется, что серия встаёт ПОД шапкой, а не за ней: шапка
 * прилипшая (F1_P29), и без scroll-padding-top прыжок по якорю уводит
 * заголовок под неё.
 */

const PAGES = ['/beyond/', '/sr/beyond/'];

/** Прокрутить так, чтобы серия встала под шапкой, — как по ссылке на неё. */
async function scrollTo(page: import('@playwright/test').Page, slug: string) {
  // scrollIntoView останавливается там же, где прыжок по ссылке: обоими
  // командует scroll-padding-top у html.
  await page.evaluate((id) => document.getElementById(id)!.scrollIntoView(), slug);
  // Адрес переписывается на следующем кадре отрисовки, а не сразу.
  await page.waitForTimeout(200);
}

for (const path of PAGES) {
  test(`${path} — у каждой серии свой якорь`, async ({ page }) => {
    await page.goto(path);

    for (const series of BEYOND_SERIES) {
      await expect(page.locator(`section.series#${series.slug}`)).toHaveCount(1);
    }
  });
}

for (const size of [PHONE, DESKTOP]) {
  const where = size === PHONE ? 'на телефоне' : 'на компьютере';

  test(`ссылка на серию открывает страницу на ней ${where}`, async ({ page }) => {
    await page.setViewportSize(size);

    for (const series of BEYOND_SERIES) {
      await page.goto(`/beyond/#${series.slug}`);

      const position = await page.evaluate((slug) => {
        const section = document.getElementById(slug)!;
        const header = document.querySelector('.header')!;
        return {
          top: section.getBoundingClientRect().top,
          headerBottom: header.getBoundingClientRect().bottom,
        };
      }, series.slug);

      // Верх серии виден и не заехал под шапку.
      expect(position.top, `${series.slug}: серия ушла под шапку`).toBeGreaterThanOrEqual(
        position.headerBottom - 1,
      );
      expect(position.top, `${series.slug}: серия ниже экрана`).toBeLessThan(size.height / 2);
    }
  });

  test(`долистал до серии — её адрес в адресной строке ${where}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/beyond/');

    // Наверху раздела адреса серии быть не должно: ссылка на Beyond целиком
    // не должна превращаться в ссылку на первую серию.
    await expect(page).toHaveURL(/\/beyond\/$/);

    for (const series of BEYOND_SERIES) {
      await scrollTo(page, series.slug);
      await expect(page).toHaveURL(new RegExp(`/beyond/#${series.slug}$`));
    }

    // Вернулись к шапке раздела — адрес снова чистый.
    await page.evaluate(() => scrollTo({ top: 0 }));
    await page.waitForTimeout(200);
    await expect(page).toHaveURL(/\/beyond\/$/);
  });
}

test('прокрутка не копит записей в истории: «назад» уводит со страницы', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page.goto('/beyond/');

  const before = await page.evaluate(() => history.length);
  for (const series of BEYOND_SERIES) await scrollTo(page, series.slug);
  expect(await page.evaluate(() => history.length)).toBe(before);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('серия заняла больше половины экрана — она и в адресе', async ({ page }) => {
  // Замечание заказчицы (2026-09-01): Formula 2 занимала уже больше половины
  // экрана, а в адресе стояло `porsche`. Считалось по линии, на которой
  // останавливается прыжок по ссылке; теперь — по тому, что видно.
  await page.setViewportSize(PHONE);
  await page.goto('/beyond/');

  // Ставим верх Formula 2 на 40% экрана: заголовок ещё не под шапкой, но серия
  // занимает больше половины того, что видно.
  await page.evaluate(() => {
    const section = document.getElementById('f2')!;
    const header = document.querySelector('.header')!.getBoundingClientRect().bottom;
    const view = innerHeight - header;
    scrollTo({ top: scrollY + section.getBoundingClientRect().top - header - view * 0.4 });
  });
  await page.waitForTimeout(200);

  await expect(page).toHaveURL(/\/beyond\/#f2$/);
});

test('нажатие на заголовок серии копирует ссылку на неё', async ({ page, context, browserName }) => {
  // Буфер обмена читает только Chromium: в WebKit у Playwright такого
  // разрешения нет. Само копирование там работает — проверить нечем.
  test.skip(browserName !== 'chromium', 'буфер обмена читается только в Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.setViewportSize(PHONE);
  await page.goto('/beyond/');

  const title = page.locator('section#f2 .series__anchor');
  await title.click();

  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/beyond\/#f2$/);
  // И человеку сказано, что ссылка скопирована.
  await expect(page.locator('section#f2 .series__copied')).toHaveText(/.+/);
});

test('открытый кадр не съедает адрес серии: закрыл — вернулся к ней', async ({ page }) => {
  // Просмотрщик (F1_P77) пишет в адрес свой «#photo-N». Пришедший по ссылке
  // на серию не должен после закрытия кадра оставаться неизвестно где.
  await page.setViewportSize(DESKTOP);
  await page.goto('/beyond/#f2');

  await page.locator('section#f2 a.shot').first().click();
  await expect(page.locator('.viewer')).toBeVisible();
  await expect(page).toHaveURL(/#photo-\d+$/);

  await page.keyboard.press('Escape');
  await expect(page.locator('.viewer')).toBeHidden();
  await expect(page).toHaveURL(/\/beyond\/#f2$/);
});

import { test, expect } from '@playwright/test';
import { GALLERIES, DESKTOP, PHONE } from './pages';

/**
 * Просмотрщик кадра (F1_P77). Проверяется не устройство кода, а то, ради чего
 * он заводился: кадр открывается крупно, раздел листается, и выйти из него
 * можно всеми способами, которыми люди выходят.
 *
 * Отдельно проверяется целость страницы без JS: кадр в ленте — ссылка на файл
 * кадра, и это единственное, что держит сайт, если скрипт не доехал.
 */

const viewer = '.viewer';
const count = '.viewer__count';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP);
});

for (const slug of GALLERIES) {
  test(`${slug}: кадр открывается крупно и знает свой номер`, async ({ page }) => {
    await page.goto(`/${slug}/`);

    const shots = page.locator('a.shot');
    const total = await shots.count();
    expect(total).toBeGreaterThan(0);

    await expect(page.locator(viewer)).toBeHidden();
    await shots.first().click();

    await expect(page.locator(viewer)).toBeVisible();
    await expect(page.locator(count)).toHaveText(`1 / ${total}`);

    // Кадр в просмотрщике крупнее, чем он же в ленте, — иначе всё это зря.
    // Ждём загрузки: до неё крупный кадр места не занимает.
    await page.waitForFunction(() => {
      const shown = document.querySelector<HTMLImageElement>('.viewer__img');
      return !!shown && shown.complete && shown.naturalWidth > 0;
    });
    const inGrid = await shots.first().locator('img').boundingBox();
    const inViewer = await page.locator('.viewer__img').boundingBox();
    expect(inViewer!.height).toBeGreaterThan(inGrid!.height);
  });

  test(`${slug}: раздел листается по кругу`, async ({ page }) => {
    await page.goto(`/${slug}/`);
    const total = await page.locator('a.shot').count();

    await page.locator('a.shot').first().click();
    await page.locator('.viewer__nav--next').click();
    await expect(page.locator(count)).toHaveText(`2 / ${total}`);

    // С первого кадра «назад» ведёт на последний, а не в пустоту.
    await page.locator('.viewer__nav--prev').click();
    await page.locator('.viewer__nav--prev').click();
    await expect(page.locator(count)).toHaveText(`${total} / ${total}`);
  });

  test(`${slug}: без JS кадр остаётся ссылкой на файл`, async ({ page }) => {
    await page.goto(`/${slug}/`);
    // Это и есть «страница цела без скрипта»: ссылка ведёт на сам кадр.
    for (const shot of await page.locator('a.shot').all()) {
      await expect(shot).toHaveAttribute('href', /\/_astro\/.+\.(jpg|jpeg|png)$/);
    }
  });
}

test('beyond: листается весь раздел, а не одна серия', async ({ page }) => {
  await page.goto('/beyond/');

  // В Beyond лент несколько, по одной на серию. Просмотрщик один на страницу,
  // поэтому счёт идёт по всем кадрам раздела.
  const grids = await page.locator('.grid').count();
  expect(grids).toBeGreaterThan(1);

  const total = await page.locator('a.shot').count();
  await page.locator('a.shot').first().click();
  await expect(page.locator(count)).toHaveText(`1 / ${total}`);
});

test('закрывается крестиком, Esc и щелчком мимо кадра', async ({ page }) => {
  await page.goto('/people/');

  await page.locator('a.shot').first().click();
  await page.locator('.viewer__close').click();
  await expect(page.locator(viewer)).toBeHidden();

  await page.locator('a.shot').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator(viewer)).toBeHidden();

  await page.locator('a.shot').first().click();
  // Угол окна — заведомо мимо кадра и мимо кнопок.
  await page.mouse.click(4, DESKTOP.height - 4);
  await expect(page.locator(viewer)).toBeHidden();

  // И по чёрному полю рядом с кадром — раньше туда щелчок не доходил вовсе:
  // рамка кадра занимает всю площадь окна, закрывала только полоска у краёв.
  await page.locator('a.shot').first().click();
  await expect(page.locator(viewer)).toBeVisible();
  const shown = (await page.locator('.viewer__img').boundingBox())!;
  await page.mouse.click(shown.x / 2, DESKTOP.height / 2);
  await expect(page.locator(viewer)).toBeHidden();
});

test('после закрытия кадр в ленте не остаётся обведённым', async ({ page }) => {
  // Фокус возвращался на кадр всегда, и вокруг него оставалась рамка —
  // на телефоне тоже, где клавиатуры нет (замечено заказчицей). Теперь фокус
  // возвращается только тем, кто правил просмотрщиком с клавиатуры.
  await page.goto('/people/');
  await page.locator('a.shot').first().click();
  await page.locator('.viewer__close').click();

  const ringed = await page.evaluate(
    () => document.querySelectorAll('a.shot:focus-visible').length,
  );
  expect(ringed, 'кадр в ленте обведён рамкой фокуса').toBe(0);
});

test('стрелки на клавиатуре листают', async ({ page }) => {
  await page.goto('/people/');
  const total = await page.locator('a.shot').count();

  await page.locator('a.shot').first().click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator(count)).toHaveText(`2 / ${total}`);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator(count)).toHaveText(`1 / ${total}`);
});

test('на телефоне «назад» закрывает просмотрщик, а не уводит со страницы', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/people/');

  await page.locator('a.shot').nth(2).click();
  await expect(page.locator(viewer)).toBeVisible();

  await page.goBack();
  await expect(page.locator(viewer)).toBeHidden();
  // Остались на той же странице раздела — это и проверяем.
  await expect(page).toHaveURL(/\/people\/$/);
});

test('закрыл — «назад» снова уводит со страницы, а не открывает просмотрщик', async ({ page }) => {
  await page.goto('/');
  await page.goto('/people/');

  await page.locator('a.shot').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator(viewer)).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(viewer)).toBeHidden();
});

test('ссылка с номером кадра открывает его сразу', async ({ page }) => {
  await page.goto('/people/#photo-4');
  const total = await page.locator('a.shot').count();

  await expect(page.locator(viewer)).toBeVisible();
  await expect(page.locator(count)).toHaveText(`4 / ${total}`);

  // И закрытие отсюда возвращает в ленту, а не уводит с сайта.
  await page.keyboard.press('Escape');
  await expect(page.locator(viewer)).toBeHidden();
  await expect(page).toHaveURL(/\/people\/$/);
});

/**
 * Кадр виден целиком и не наезжает на счётчик. Правило прямое, без допусков:
 * ради «увидеть кадр целиком» просмотрщик и заводился.
 *
 * Проверка не лишняя: первый раз предел кадру был задан процентами от рамки,
 * а проценты внутри `dialog` посчитались от самого кадра — вертикальный кадр
 * уезжал за экран сверху и снизу, и на глаз это выглядело кадрировкой.
 */
for (const [where, size] of [
  ['на компьютере', DESKTOP],
  ['на телефоне', PHONE],
] as const) {
  test(`people: каждый кадр ${where} виден целиком`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/people/');

    const total = await page.locator('a.shot').count();
    await page.locator('a.shot').first().click();

    for (let step = 0; step < total; step++) {
      await page.waitForFunction(() => {
        const shown = document.querySelector<HTMLImageElement>('.viewer__img');
        return !!shown && shown.complete && shown.naturalWidth > 0;
      });

      const seen = await page.evaluate(() => {
        const shown = document.querySelector('.viewer__img')!.getBoundingClientRect();
        const label = document.querySelector('.viewer__count')!.getBoundingClientRect();
        return {
          top: shown.top,
          left: shown.left,
          right: window.innerWidth - shown.right,
          gapToCount: label.top - shown.bottom,
        };
      });

      const at = `кадр ${step + 1} из ${total}`;
      expect(seen.top, `${at}: срезан сверху`).toBeGreaterThanOrEqual(0);
      expect(seen.left, `${at}: срезан слева`).toBeGreaterThanOrEqual(0);
      expect(seen.right, `${at}: срезан справа`).toBeGreaterThanOrEqual(0);
      expect(seen.gapToCount, `${at}: лежит на счётчике`).toBeGreaterThanOrEqual(0);

      await page.locator('.viewer__nav--next').click();
    }
  });
}

test('быстрые щелчки по стрелке не выделяют кадр', async ({ page }) => {
  // Листая, по стрелке щёлкают быстро, и два щелчка подряд браузер считает
  // двойным: кадр выделялся целиком и заливался синим (замечено заказчицей).
  await page.goto('/people/');
  await page.locator('a.shot').first().click();

  const arrow = (await page.locator('.viewer__nav--next').boundingBox())!;
  await page.mouse.dblclick(arrow.x + arrow.width / 2, arrow.y + arrow.height / 2);

  const selected = await page.evaluate(() => {
    const selection = getSelection();
    return !selection || selection.isCollapsed ? '' : selection.toString() || 'кадр';
  });
  expect(selected, 'внутри просмотрщика что-то выделилось').toBe('');
});

test('при открытии вокруг крестика нет рамки фокуса', async ({ page }) => {
  // Браузер ставил фокус на первую кнопку окна — на крестик — и обводил её
  // рамкой при каждом открытии, в том числе на телефоне, где клавиатуры нет
  // (замечено заказчицей). Фокус теперь у самого окна.
  await page.goto('/people/');
  await page.locator('a.shot').first().click();

  const ringed = await page.evaluate(() =>
    [...document.querySelectorAll('.viewer *')].filter((el) => el.matches(':focus-visible')).length,
  );
  expect(ringed, 'что-то в просмотрщике обведено рамкой фокуса').toBe(0);
});

test('сербская версия просмотрщика подписана по-сербски', async ({ page }) => {
  await page.goto('/sr/people/');
  await expect(page.locator('.viewer__close')).toHaveAttribute('aria-label', 'Zatvori');
  await expect(page.locator('.viewer__nav--next')).toHaveAttribute(
    'aria-label',
    'Sledeća fotografija',
  );
});

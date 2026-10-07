import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DESKTOP } from './pages';

/**
 * Счётчик посещений (F1_P51). Настоящий счётчик в тестах не грузится: вместо
 * `umami.js` подсовывается заглушка, которая складывает события в
 * sessionStorage — там они переживают переход на другую страницу.
 *
 * Проверяется то, ради чего всё затевалось: клик по контакту и открытый
 * кадр долетают до счётчика с понятными именами, адрес почты в отчёт не
 * попадает, и переход по ссылке не ждёт, пока уйдёт отчёт.
 *
 * Если номер сайта в `site.ts` пуст, счётчика на страницах нет и проверять
 * нечего — тесты пропускаются.
 */

type Event = [string, Record<string, string | number> | undefined];

const STUB = `window.umami = { track(name, data) {
  const all = JSON.parse(sessionStorage.getItem('events') || '[]');
  all.push([name, data]);
  sessionStorage.setItem('events', JSON.stringify(all));
} };`;

/** Страница догрузилась: и счётчик, и наш слушатель нажатий уже на месте. */
const ready = async (page: Page) => {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !!window.umami);
};

const events = (page: Page): Promise<Event[]> =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem('events') || '[]'));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.route('**/umami.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: STUB }),
  );
  // Чужие сайты не открываем: Instagram и почта — это только клик.
  await page.context().route(/instagram\.com/, (route) => route.abort());

  await page.goto('/contact/');
  const counter = await page.locator('script[data-website-id]').count();
  test.skip(counter === 0, 'номер сайта Umami не вписан — счётчика на сайте нет');
  await ready(page);
});

test('клик по почте — это контакт, а адрес почты в отчёт не идёт', async ({ page }) => {
  await page.evaluate(() => {
    // Почтовую программу не открываем: переход по mailto: гасится.
    document.addEventListener('click', (e) => e.preventDefault());
  });
  await page.locator('main a[href^="mailto:"]').first().click();

  const got = await events(page);
  expect(got).toContainEqual(['Контакт', expect.objectContaining({ через: 'почта' })]);
  expect(JSON.stringify(got)).not.toContain('@');
});

test('клик по Instagram — это контакт', async ({ page }) => {
  await page.locator('main a[href*="instagram.com"]').first().click();
  await expect.poll(() => events(page)).toContainEqual([
    'Контакт',
    expect.objectContaining({ через: 'Instagram' }),
  ]);
});

test('ссылка в меню: нажатие посчитано, и переход не ждёт отчёта', async ({ page }) => {
  await page.locator('header nav a[href*="people"]').click();
  await expect(page).toHaveURL(/\/people\/$/);
  expect(await events(page)).toContainEqual(['Меню', { куда: 'People' }]);
});

test('Instagram партнёра — не контакт', async ({ page }) => {
  await page.goto('/about/');
  await ready(page);
  await page.locator('main a[href*="instagram.com/formula1srbija"]').click();
  await expect.poll(() => events(page)).toContainEqual(['Instagram партнёра', { кто: 'formula1srbija' }]);
  expect((await events(page)).map(([name]) => name)).not.toContain('Контакт');
});

test('у нажатий понятные имена, а не общее «Клик»', async ({ page }) => {
  // Пункт условий работы — на той же странице контактов.
  await page.locator('summary').first().click();
  await page.goto('/');
  await ready(page);
  await page.locator('a.card[href*="track"]').click();
  await page.waitForURL(/\/track\/$/);
  await ready(page);
  await page.locator('footer a[href*="license"]').click();
  await expect(page).toHaveURL(/\/license\/$/);

  const names = (await events(page)).map(([name, data]) => [name, Object.values(data ?? {})[0]]);
  expect(names).toEqual([
    ['Условия работы: пункт', expect.any(String)],
    ['Карточка раздела', 'Track'],
    ['Подвал', 'Условия использования'],
  ]);
});

test('переключение языка', async ({ page }) => {
  await page.locator('header a[hreflang="sr"]').click();
  await expect(page).toHaveURL(/\/sr\//);
  expect(await events(page)).toContainEqual(['Язык', { на: 'sr' }]);
});

test('кадр: какой открыли, как пролистали, сколько посмотрели', async ({ page }) => {
  await page.goto('/people/');
  await ready(page);

  await page.locator('a.shot').first().click();
  await page.locator('.viewer__nav--next').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  // Окно закрывается не мгновенно — событие о закрытии приходит следом.
  await expect.poll(async () => (await events(page)).some(([name]) => name === 'Просмотр закрыт')).toBe(true);

  const got = await events(page);
  expect(got.map(([name, data]) => [name, data?.['как'] ?? data?.['кадров']])).toEqual([
    ['Кадр', 'из ленты'],
    ['Кадр', 'стрелка'],
    ['Кадр', 'клавиша'],
    ['Просмотр закрыт', 3],
  ]);
  // Кадр назван по файлу, без хэша сборки: `010-circuit`, а не `010-circuit.CYvaYAXU`.
  for (const [, data] of got.slice(0, 3)) expect(String(data?.['кадр'])).toMatch(/^[\w-]+$/);
});

test('у каждой серии свой счётчик — по полному названию', async ({ page }) => {
  await page.goto('/beyond/');
  await ready(page);
  // В списке серия сокращена до «Porsche Supercup», в счётчике — полное имя.
  await page.locator('.series-nav a[href="#porsche"]').click();
  await page.locator('.series__anchor[href="#t4"]').click();
  await expect.poll(() => events(page)).toEqual([
    ['Beyond F1: Porsche Mobil 1 Supercup', { как: 'из списка' }],
    ['Beyond F1: T4 Series Serbia', { как: 'скопировали ссылку' }],
  ]);
});

test('кадр в Beyond знает свою серию', async ({ page }) => {
  await page.goto('/beyond/');
  await ready(page);
  await page.locator('#t4 a.shot').first().click();
  await expect.poll(() => events(page)).toContainEqual([
    'Кадр',
    expect.objectContaining({ серия: 'T4 Series Serbia', как: 'из ленты' }),
  ]);
});

test('кадр по присланной ссылке', async ({ page }) => {
  await page.goto('/people/#photo-2');
  await expect.poll(() => events(page)).toContainEqual([
    'Кадр',
    expect.objectContaining({ как: 'по ссылке' }),
  ]);
});

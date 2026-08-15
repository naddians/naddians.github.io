import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PAGES, GALLERIES } from './pages';

/**
 * Проверки, для которых браузер почти не нужен, — зато они ловят класс ошибки,
 * который глазом не ловится совсем: тихо ломается сербская версия, а смотрим
 * мы английскую.
 */

/** Все ключи вложенного объекта в виде «cta.title». */
function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? keysOf(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

test('тексты: в сербском есть всё, что в английском', () => {
  // Тексты правятся парой (F1_P27, F1_P30, F1_P37). Забыть строку в одном
  // из файлов легко, и тогда страница молча покажет пустоту.
  const en = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  const sr = JSON.parse(readFileSync(new URL('../src/i18n/sr.json', import.meta.url), 'utf8'));

  const enKeys = keysOf(en);
  const srKeys = keysOf(sr);

  expect(enKeys.filter((k) => !srKeys.includes(k)), 'нет в sr.json').toEqual([]);
  expect(srKeys.filter((k) => !enKeys.includes(k)), 'нет в en.json').toEqual([]);
});

for (const path of PAGES) {
  test(`${path} — есть заголовок, описание и canonical`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveTitle(/.+/);

    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /.+/);

    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /^https:\/\//);
  });
}

for (const slug of GALLERIES) {
  test(`${slug} — у кадров в ленте есть подпись для робота`, async ({ page }) => {
    await page.goto(`/${slug}/`);

    const alts = await page.locator('.grid img').evaluateAll((images) =>
      images.map((img) => (img as HTMLImageElement).alt),
    );

    expect(alts.length).toBeGreaterThan(0);
    expect(alts.filter((alt) => !alt.trim()), 'кадры без alt').toEqual([]);
  });
}

test('карта сайта содержит все страницы', async ({ request }) => {
  // В F1_P14 выяснилось, что в карте только страницы; следим хотя бы за тем,
  // чтобы ни одна из них оттуда не выпала.
  const index = await request.get('/sitemap-index.xml');
  expect(index.ok(), 'карта сайта отдаётся').toBeTruthy();

  const files = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls: string[] = [];
  for (const file of files) {
    const part = await request.get(new URL(file).pathname);
    urls.push(...[...(await part.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }

  const missing = PAGES.filter((path) => !urls.some((url) => new URL(url).pathname === path));
  expect(missing, 'страниц нет в карте сайта').toEqual([]);
});

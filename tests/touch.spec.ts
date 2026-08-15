import { test, expect } from '@playwright/test';
import { PAGES, PHONE, NARROW } from './pages';

/**
 * Зона нажатия. Норма 44px по высоте — Apple, у Google 48; в F1_P24 шапку
 * привели к ней руками (было 22–27px, в меню приходилось целиться), в F1_P38
 * к ней же довели кнопки контактов, в F1_P39 — ссылку в подвале.
 * Держится это всё честным словом: любая правка отступов может незаметно
 * уронить высоту обратно. Теперь мерит браузер.
 *
 * Ширина проверяется мягче: у переключателя языков «EN»/«SR» это 35px —
 * два символа шире не сделать, не раздвинув их на глаз, а между ними стоит «/»,
 * и промах попадает в него, а не в чужой язык (решение из F1_P24).
 */

const MIN_HEIGHT = 44;
const MIN_WIDTH = 35;

for (const path of PAGES) {
  test(`${path} — ссылки можно нажать пальцем`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(path);

    const links = await page.locator('a:visible').all();
    expect(links.length).toBeGreaterThan(0);

    const small: string[] = [];
    for (const link of links) {
      const box = await link.boundingBox();
      if (!box) continue;

      const skip = await link.evaluate((el) => {
        // «Skip to content» — для клавиатуры, до фокуса её на экране нет:
        // пальцем в неё не целятся, зона нажатия ей не нужна.
        if (el.classList.contains('skip')) return true;
        // Ссылка внутри абзаца — слово в предложении, а не самостоятельная цель.
        return !!el.closest('p');
      });
      if (skip) continue;

      // Переключатель языков — оговорённое исключение из F1_P24: «EN» и «SR»
      // это два символа, шире их не сделать, не раздвинув на глаз; между ними
      // стоит «/», и промах попадает в него, а не в чужой язык.
      const isLang = await link.evaluate((el) => !!el.closest('.lang'));
      const minWidth = isLang ? 34 : MIN_WIDTH;

      if (box.height < MIN_HEIGHT || box.width < minWidth) {
        const label = (await link.textContent())?.trim() || (await link.getAttribute('href'));
        small.push(`«${label}» ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }

    expect(small, `мелкие цели: ${small.join(', ')}`).toEqual([]);
  });
}

/**
 * Горизонтальной прокрутки быть не должно нигде. 320px — самый узкий экран,
 * который считаем (iPhone SE первого поколения и режим увеличенного шрифта).
 * На этой ширине уже ловили перенос «About» на вторую строку меню (М5 из F1_P35)
 * и разъезд коротких описаний на карточках (F1_P21).
 */
for (const path of PAGES) {
  test(`${path} — на узком экране нет прокрутки вбок`, async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto(path);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });

    expect(overflow, 'страница шире окна на, px').toBeLessThanOrEqual(0);
  });
}

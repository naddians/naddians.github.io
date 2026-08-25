import { test, expect } from '@playwright/test';
import { GALLERIES, TABLET, DESKTOP, PHONE } from './pages';

/**
 * Галерея разложена рядами равной высоты (F1_P36). Проверяем не устройство
 * кода, а то, ради чего переделывали: под кадрами не остаётся дыр.
 *
 * Беда была хроническая и вся про один и тот же хвост: пустая колонка справа
 * (F1_P23), дыра между группами (F1_P26), обрыв левой колонки (F1_P31), хвост
 * в People на планшете (F1_P45), провал под Формулой-2 в 41% высоты (F1_P49).
 * Раньше здесь стоял допуск «расходится не больше чем на 15%» и отдельные
 * числа-эталоны для планшета, где хвост был огромным сознательно. Теперь
 * допуска нет: у рядов низ ровный по устройству, и правило прямое.
 */

/** Кадры, сгруппированные по рядам: ряд — те, у кого совпал верхний край. */
async function rowsOf(grid: import('@playwright/test').Locator) {
  return grid.evaluate((el) => {
    const left = el.getBoundingClientRect().left;
    const right = el.getBoundingClientRect().right;
    const rows: { top: number; heights: number[]; from: number; to: number }[] = [];
    for (const shot of el.querySelectorAll('.shot')) {
      const box = shot.getBoundingClientRect();
      // Полпикселя разницы даёт округление дробных ширин, это не новый ряд.
      const row = rows.find((r) => Math.abs(r.top - box.top) < 2);
      if (row) {
        row.heights.push(box.height);
        // from — до самого левого кадра в ряду, to — от самого правого: то есть
        // оба раза минимум, у краёв ряда, а не у кадров в его середине.
        row.from = Math.min(row.from, box.left - left);
        row.to = Math.min(row.to, right - box.right);
      } else {
        rows.push({ top: box.top, heights: [box.height], from: box.left - left, to: right - box.right });
      }
    }
    return rows;
  });
}

for (const slug of GALLERIES) {
  for (const [where, size] of [['на компьютере', DESKTOP], ['на планшете', TABLET]] as const) {
    test(`${slug}: ${where} ряды заполняют ленту`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto(`/${slug}/`);

      // В Beyond сеток несколько — по одной на серию (Порше, Ф2, T4).
      const grids = await page.locator('.grid').all();
      expect(grids.length).toBeGreaterThan(0);

      for (const grid of grids) {
        const rows = await rowsOf(grid);
        expect(rows.length).toBeGreaterThan(0);

        for (const row of rows) {
          // Ряд начинается у левого края ленты и кончается у правого. Это и есть
          // «дыр нет»: неполный ряд не дотянулся бы до края и оставил бы под
          // соседним рядом пустое место.
          expect(row.from, `ряд начинается с отступом ${row.from.toFixed(1)}px`).toBeLessThan(1);
          expect(row.to, `ряд не дотянут до края на ${row.to.toFixed(1)}px`).toBeLessThan(1);

          // В ряду у всех одна высота: иначе низ ряда не ровный.
          const spread = Math.max(...row.heights) - Math.min(...row.heights);
          expect(spread, `высоты в ряду: ${row.heights.map(Math.round).join(' / ')}`).toBeLessThan(2);
        }
      }
    });
  }

  test(`${slug}: на телефоне лента идёт одним столбцом`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto(`/${slug}/`);

    // Рядами на телефоне кадры выходят с ноготь, поэтому там столбец — и
    // порядок кадров в нём тот же, что в разметке (его считает npm run sharpness).
    for (const grid of await page.locator('.grid').all()) {
      const rows = await rowsOf(grid);
      const shots = await grid.locator('.shot').count();
      expect(rows.length, 'кадров в столбце').toBe(shots);
    }
  });
}

import { test, expect } from '@playwright/test';
import { GALLERIES } from './pages';

/**
 * То же правило, что в rows.spec.ts, но протянутое по ширинам окна подряд,
 * а не по трём опорным. Стережёт беду, которой у колонок быть не могло:
 * ширину внутри ряда подбирает браузер, и ряд переносится сам, если кадры
 * в него не влезли. Влезать они обязаны — основа кадра (`flex-basis`) для того
 * и взята с большим запасом, — но запас этот на глазок, и проверить его можно
 * только браузером. Перенесись ряд раньше своей метки, он не дотянулся бы
 * до правого края, и под ним появилась бы ровно та дыра, от которой уходили.
 *
 * Ширины взяты по границам, где раскладка меняется (640, 1024), по обе стороны
 * от них, и вразброс между ними.
 */
const WIDTHS = [639, 640, 700, 800, 1023, 1024, 1200, 1440, 1600, 1920];

for (const slug of GALLERIES) {
  test(`${slug}: ряды заполняют ленту на любой ширине окна`, async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${slug}/`);

      const ragged = await page.evaluate(() => {
        const out: string[] = [];
        for (const grid of document.querySelectorAll('.grid')) {
          const gb = grid.getBoundingClientRect();
          const shots = [...grid.querySelectorAll('.shot')].map((s) => s.getBoundingClientRect());
          const rows: DOMRect[][] = [];
          for (const box of shots) {
            const row = rows.find((r) => Math.abs(r[0].top - box.top) < 2);
            if (row) row.push(box);
            else rows.push([box]);
          }
          for (const row of rows) {
            const left = Math.min(...row.map((i) => i.left)) - gb.left;
            const right = gb.right - Math.max(...row.map((i) => i.right));
            // Ниже 640px лента идёт столбцом: там ряд из одного кадра во всю
            // ширину — это не неполный ряд, а как задумано.
            const column = row.length === 1 && Math.abs(row[0].width - gb.width) < 1;
            if (!column && (left > 1 || right > 1)) {
              out.push(`${row.length}шт: слева ${left.toFixed(1)}, справа ${right.toFixed(1)}`);
            }
          }
        }
        return out;
      });

      expect(ragged, `при ${width}px`).toEqual([]);
    }
  });
}

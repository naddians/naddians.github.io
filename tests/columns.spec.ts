import { test, expect } from '@playwright/test';
import { GALLERIES, TABLET, DESKTOP } from './pages';

/**
 * Низ колонок в галерее должен сходиться. Беда эта у нас хроническая: пустая
 * колонка справа (F1_P23), дыра между группами (F1_P26), обрыв левой колонки
 * на треть раньше остальных (F1_P31), хвост в People на планшете (F1_P45).
 * Каждый раз её замечали глазом и мерили руками — теперь мерит браузер.
 *
 * Правило сформулировано про результат, а не про устройство кода: «низ колонок
 * расходится не больше чем на столько-то». Поэтому переезд на ряды равной
 * высоты (F1_P36) эти тесты не выбросит — они переживут смену раскладки
 * и как раз покажут, стало ли лучше.
 *
 * Колонка — это не всегда один и тот же элемент: до 1024px колонками работают
 * .grid__half, выше — .grid__third, а лишний уровень распускается через
 * display: contents. Поэтому селектор зависит от ширины окна.
 */

/** Высоты видимых колонок одной сетки. Элементы с display: contents коробки не имеют. */
async function columnHeights(grid: import('@playwright/test').Locator, selector: string) {
  const boxes = await grid.locator(selector).all();
  const heights: number[] = [];
  for (const box of boxes) {
    const rect = await box.boundingBox();
    if (rect && rect.height > 0) heights.push(rect.height);
  }
  return heights;
}

/** Хвост — насколько самая длинная колонка длиннее самой короткой. */
function tail(heights: number[]) {
  return Math.max(...heights) - Math.min(...heights);
}

for (const slug of GALLERIES) {
  test(`${slug}: на компьютере низ колонок сходится`, async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(`/${slug}/`);

    // В Beyond сеток несколько — по одной на серию (Порше, Ф2).
    const grids = await page.locator('.grid').all();
    expect(grids.length).toBeGreaterThan(0);

    for (const grid of grids) {
      const heights = await columnHeights(grid, '.grid__third');
      if (heights.length < 2) continue; // группа короче трёх кадров — колонок нет

      // 15% от самой длинной колонки. Сейчас у нас 3% на On-Track и 8% на People,
      // то есть запас есть; тест ловит возврат к дырам в полкадра и хуже.
      expect(tail(heights), `хвост колонок: ${heights.map(Math.round).join(' / ')}`)
        .toBeLessThan(Math.max(...heights) * 0.15);
    }
  });

  test(`${slug}: на планшете хвост не растёт`, async ({ page }) => {
    await page.setViewportSize(TABLET);
    await page.goto(`/${slug}/`);

    const grids = await page.locator('.grid').all();
    let worst = 0;
    for (const grid of grids) {
      const heights = await columnHeights(grid, '.grid__half');
      if (heights.length < 2) continue;
      worst = Math.max(worst, tail(heights));
    }

    // Здесь порога «как надо» нет и быть не может: на 640–1023px хвост у нас
    // огромный (People 52%), и это цена, заплаченная сознательно — граница двух
    // колонок обязана совпасть с границей трёх, приоритет отдан широкому экрану
    // (F1_P26, F1_P31, F1_P45). Ставить тут правило «меньше 25%» значит держать
    // вечно красный тест, а это шум.
    //
    // Поэтому проверяем другое, и ровно то, чего боялись в F1_P45: «чем больше
    // кадров в разделе, тем хуже, следующий добавленный кадр хвост удлинит».
    // Числа ниже сняты 2026-08-15 и совпадают с замерами из беклога. Тест
    // краснеет, если стало хуже, — и молчит, пока не стало.
    //
    // Когда F1_P36 заменит колонки рядами, хвост должен уйти в ноль: тогда эти
    // числа заменяются обычным правилом, как на компьютере.
    const wasWorst: Record<string, number> = {
      track: 1976,
      people: 2687,
      atmosphere: 1194,
      beyond: 510,
    };

    expect(worst, `хвост был ${wasWorst[slug]}px, стал ${Math.round(worst)}px`)
      .toBeLessThan(wasWorst[slug] * 1.1);
  });
}

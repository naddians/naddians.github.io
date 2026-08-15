import { defineConfig, devices } from '@playwright/test';

/**
 * Тесты гоняются по СОБРАННОМУ сайту, а не по dev-серверу: F1_P33 был про
 * сборку (шапка резалась при ней), и проверять надо ровно то, что уедет
 * на GitHub Pages. Поэтому webServer сначала собирает, потом поднимает preview.
 *
 * Сборка небыстрая — она пережимает фотографии, — но Astro держит готовые
 * картинки в node_modules/.astro/assets, поэтому повторные прогоны быстрые.
 *
 * Два браузера: Chromium и WebKit. WebKit — это движок Safari, и он здесь
 * не для галочки: дыра между группами кадров (F1_P26) в Chromium
 * не воспроизводилась вовсе, она была только в Safari.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],

  /**
   * Порт 4331, а не обычный 4321: на 4321 сидит `astro dev`, и если он окажется
   * запущен (своя сессия, соседняя вкладка), Playwright молча подцепит dev-сервер
   * вместо собранного сайта — тесты будут проверять не то, что уедет на Pages.
   */
  use: {
    baseURL: 'http://localhost:4331',
  },

  webServer: {
    command: 'npm run build && npm run preview -- --port 4331',
    port: 4331,
    reuseExistingServer: !process.env.CI,
    timeout: 15 * 60 * 1000,
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

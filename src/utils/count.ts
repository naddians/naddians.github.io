/**
 * Отправить событие в счётчик посещений (F1_P51).
 *
 * Счётчик (`public/umami.js`) грузится последним, после кадров, поэтому
 * событие может случиться раньше, чем он готов: кадр по присланной ссылке
 * открывается сразу при загрузке страницы. Такие события ждут в очереди
 * и уходят, когда счётчик загрузится.
 *
 * Если счётчика на странице нет (номер сайта не вписан), не делает ничего.
 */

type Data = Record<string, string | number>;

declare global {
  interface Window {
    umami?: { track(name: string, data?: Data): void };
  }
}

const waiting: [string, Data | undefined][] = [];

export function count(name: string, data?: Data) {
  if (window.umami) {
    window.umami.track(name, data);
    return;
  }
  const script = document.querySelector<HTMLScriptElement>('script[data-website-id]');
  if (!script) return;
  if (waiting.length === 0) {
    script.addEventListener('load', () => {
      for (const [n, d] of waiting.splice(0)) window.umami?.track(n, d);
    });
  }
  waiting.push([name, data]);
}

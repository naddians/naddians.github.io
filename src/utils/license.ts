import { getAbsoluteLocaleUrl } from 'astro:i18n';
import { localeFromUrl, type Locale } from '../i18n';

/**
 * Условия использования кадров для робота (F1_P60). Два поля рядом с автором
 * в каждом `ImageObject`:
 *
 * `license` — страница с условиями. Без неё Google не ставит в Картинках
 * подпись «Licensable» со ссылкой «Лицензировать»: разметка отвечала на вопрос
 * «чей это снимок», но не отвечала на «можно ли его взять и как», и человек,
 * нашедший кадр в поиске, просто сохранял картинку себе.
 *
 * `acquireLicensePage` — страница, где кадр запрашивают. Отдельной формы нет:
 * ведёт на контакты, там почта, Telegram и Instagram.
 *
 * Ссылки абсолютные (того требует Google) и на языке страницы: кадр с сербской
 * страницы ведёт на сербские условия.
 */
export function licenseLinks(locale: Locale) {
  return {
    license: getAbsoluteLocaleUrl(locale, 'license'),
    acquireLicensePage: getAbsoluteLocaleUrl(locale, 'contact'),
  };
}

/**
 * То же для компонентов, которым локаль не передают (лента кадров, шапка
 * раздела): она берётся из адреса страницы, на которой компонент оказался.
 */
export function licenseLinksFor(url: URL): ReturnType<typeof licenseLinks> {
  return licenseLinks(localeFromUrl(url, import.meta.env.BASE_URL));
}

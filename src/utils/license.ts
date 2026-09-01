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
 * `acquireLicensePage` — страница, где кадр запрашивают. Отдельной формы нет,
 * и с F1_P62 это та же страница условий: адреса — почта и инстаграм — стоят
 * кнопками прямо под условиями (телеграма среди них нет с F1_P79). Человек
 * из Картинок Google приходит спросить про один кадр, а не заказать съёмку, —
 * переход на контакты был лишним шагом между «прочитал условия» и «написал».
 *
 * Ссылки абсолютные (того требует Google) и на языке страницы: кадр с сербской
 * страницы ведёт на сербские условия.
 */
export function licenseLinks(locale: Locale) {
  return {
    license: getAbsoluteLocaleUrl(locale, 'license'),
    acquireLicensePage: getAbsoluteLocaleUrl(locale, 'license'),
  };
}

/**
 * То же для компонентов, которым локаль не передают (лента кадров, шапка
 * раздела): она берётся из адреса страницы, на которой компонент оказался.
 */
export function licenseLinksFor(url: URL): ReturnType<typeof licenseLinks> {
  return licenseLinks(localeFromUrl(url, import.meta.env.BASE_URL));
}

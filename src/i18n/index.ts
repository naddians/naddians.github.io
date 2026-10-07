import en from './en.json';
import sr from './sr.json';
import de from './de.json';

export const LOCALES = ['en', 'de', 'sr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Код языка для атрибута lang / hreflang. Сербский — латиница (ТЗ §4). */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  sr: 'sr-Latn',
  de: 'de',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'EN',
  sr: 'SR',
  de: 'DE',
};

const DICTS = { en, sr, de } as const;

export type Dict = typeof en;

export function t(locale: Locale): Dict {
  return DICTS[locale] as Dict;
}

/** Ключи страниц = куски URL. Пустая строка — главная. */
export const ROUTES = [
  '',
  'track',
  'people',
  'atmosphere',
  'beyond',
  'about',
  'contact',
  'license',
  // Открытый архив (F1_P93): закрыт от поиска, в меню и подвале ссылки нет.
  'freearchive',
] as const;
export type Route = (typeof ROUTES)[number];

/** Ключ страницы для meta-текстов. */
export type MetaKey = keyof Dict['meta'];

export function metaKeyFor(route: Route): MetaKey {
  return (route === '' ? 'home' : route) as MetaKey;
}

/**
 * Локаль текущей страницы, определённая по URL.
 * Astro.currentLocale работает, но возвращает undefined на 404 — здесь надёжнее.
 */
export function localeFromUrl(url: URL, base: string): Locale {
  const path = url.pathname.slice(base.replace(/\/$/, '').length);
  const prefixed = LOCALES.find((code) => code !== 'en' && path.startsWith(`/${code}`));
  return prefixed ?? 'en';
}

import en from './en.json';
import sr from './sr.json';

export const LOCALES = ['en', 'sr'] as const;
export type Locale = (typeof LOCALES)[number];

/** Код языка для атрибута lang / hreflang. Сербский — латиница (ТЗ §4). */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  sr: 'sr-Latn',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'EN',
  sr: 'SR',
};

const DICTS = { en, sr } as const;

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
  return path.startsWith('/sr') ? 'sr' : 'en';
}

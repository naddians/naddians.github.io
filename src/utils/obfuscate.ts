/**
 * HTML-энтити для каждого символа. Браузер отрисует как обычный текст,
 * а простые спам-боты, скребущие сырой HTML регуляркой, адрес не найдут.
 * Вставляется только через set:html, иначе Astro экранирует амперсанды.
 */
export function entities(value: string): string {
  return value
    .split('')
    .map((char) => `&#${char.codePointAt(0)};`)
    .join('');
}

/** Готовая ссылка на почту с обфусцированным адресом в href и в тексте. */
export function mailtoLink(email: string, className = 'contact-link'): string {
  const encoded = entities(email);
  return `<a class="${className}" href="mailto:${encoded}">${encoded}</a>`;
}

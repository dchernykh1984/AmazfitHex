// Localized screen strings: resolve the device language to a supported one and
// look up a string, falling back to English and then the raw key so the screen
// always renders something. Pure and unit tested.
import { LABELS } from "./labels.js";

export { UI_KEYS } from "./keys.js";

export const DEFAULT_LANGUAGE = "en";

// Every language that has a table.
export const LANGUAGES = Object.keys(LABELS);

// Map a device locale ("ru-RU", "en_US", "de") to a supported 2-letter language,
// or the default when it is unknown or empty.
export function resolveLanguage(locale) {
  if (!locale) {
    return DEFAULT_LANGUAGE;
  }
  const primary = String(locale).toLowerCase().split(/[-_]/)[0];
  return Object.prototype.hasOwnProperty.call(LABELS, primary) ? primary : DEFAULT_LANGUAGE;
}

// Zepp OS getLanguage() returns an integer from a fixed table, not a locale
// string. Map the integers for the languages we translate to their 2-letter code;
// anything else (including Kazakh, which Zepp OS does not expose as a device
// language) falls back to English. See docs.zepp.com Multilingual Mapping.
const ZEPP_LANGUAGE_CODES = {
  2: "en",
  4: "ru",
  7: "de",
  6: "fr",
  10: "it",
  3: "es",
  15: "pt",
  16: "nl",
  9: "pl",
  22: "cs",
};

export function languageFromZeppCode(code) {
  return Object.prototype.hasOwnProperty.call(ZEPP_LANGUAGE_CODES, code)
    ? ZEPP_LANGUAGE_CODES[code]
    : DEFAULT_LANGUAGE;
}

// The localized string for a key in the given language, falling back to English
// and then to the raw key.
export function labelFor(language, key) {
  const lang = Object.prototype.hasOwnProperty.call(LABELS, language) ? language : DEFAULT_LANGUAGE;
  const localized = LABELS[lang][key];
  if (localized) {
    return localized;
  }
  return LABELS[DEFAULT_LANGUAGE][key] || key;
}

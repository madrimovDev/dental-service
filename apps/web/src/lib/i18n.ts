import { DEFAULT_LANGUAGE, resources, SUPPORTED_LANGUAGES } from '@dental/i18n';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { installZodErrorMap } from './zod-error-map.ts';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'dental_lang',
    },
  });

// CLI-182: global Zod 4 error map → i18n (statik sxemalar uchun uz/ru
// validatsiya xabarlari). `i18n.t` lazy chaqirilgani uchun til almashganda
// xabarlar avtomatik yangilanadi.
installZodErrorMap(i18n);

export { i18n };

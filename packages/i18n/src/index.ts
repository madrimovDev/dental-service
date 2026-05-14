// @dental/i18n — translation bundles for Uzbek (Latin) and Russian
// Frontend `react-i18next` orqali ishlatadi, backend `Accept-Language` orqali

import ru from './locales/ru.json';
import uz from './locales/uz.json';

export const SUPPORTED_LANGUAGES = ['uz', 'ru'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'uz';

export const resources = {
  uz: { translation: uz },
  ru: { translation: ru },
} as const;

export type TranslationBundle = typeof uz;

/**
 * Dayjs initialization — relativeTime plugin + uz-latn/ru locale wiring.
 * Import this module ONCE at the app entry point (main.tsx) to ensure
 * dayjs locale tracks the active i18n language automatically.
 *
 * Locale mapping:
 *   i18n language starts with "ru" → dayjs locale "ru"
 *   otherwise                      → dayjs locale "uz-latn"
 */
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/uz-latn';
import relativeTime from 'dayjs/plugin/relativeTime';
import { i18n } from './i18n.ts';

dayjs.extend(relativeTime);

function setDayjsLocale(lng: string): void {
  dayjs.locale(lng.startsWith('ru') ? 'ru' : 'uz-latn');
}

// Set immediately from the current i18n language.
setDayjsLocale(i18n.language ?? 'uz');

// Keep locale in sync when the user switches language.
i18n.on('languageChanged', setDayjsLocale);

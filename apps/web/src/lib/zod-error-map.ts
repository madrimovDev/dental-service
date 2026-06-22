import type { i18n as I18nInstance } from 'i18next';
import { z } from 'zod';

/**
 * Global Zod 4 error map → i18n (CLI-182).
 *
 * Zod 4 issue kodlarini `validation.*` i18n kalitlariga mostlaydi va joriy
 * til bo'yicha tarjima qaytaradi. `i18n.t(...)` lazy chaqirilgani uchun til
 * almashganda xabarlar avtomatik yangilanadi (qayta ulashsiz).
 *
 * Precedence: global customError sxema-darajadagi xabardan PAST — shuning uchun
 * `makeSchema(t)` ichidagi `t('validation.phone_invalid')` kabi qo'lda berilgan
 * xabarlar saqlanib qoladi; bu o'zgarish faqat qo'shimcha (statik sxemalar
 * uchun raw inglizcha o'rniga uz/ru beradi).
 *
 * Mostlanmagan kod uchun `undefined` qaytadi → Zod o'z inglizcha defaultiga tushadi
 * (yo'q-kalit stringi chiqmaydi).
 */
export function buildZodErrorMap(i18n: I18nInstance): z.core.$ZodErrorMap {
  const t = (key: string, vars?: Record<string, unknown>) =>
    i18n.t(`validation.${key}`, vars ?? {});

  return (issue) => {
    switch (issue.code) {
      case 'invalid_type': {
        // undefined/null kiritilmagan maydon → "majburiy"
        if (issue.input === undefined || issue.input === null) {
          return t('required');
        }
        return t('invalidType');
      }

      case 'too_small': {
        const min = String(issue.minimum);
        if (issue.origin === 'string') {
          // bo'sh majburiy matn (min 1) → "majburiy", aks holda "kamida N belgi"
          return Number(issue.minimum) <= 1 ? t('required') : t('tooShort', { min });
        }
        if (issue.origin === 'array' || issue.origin === 'set') {
          return t('tooFew', { min });
        }
        // number / int / bigint / date
        return t('tooSmall', { min });
      }

      case 'too_big': {
        const max = String(issue.maximum);
        if (issue.origin === 'string') {
          return t('tooLong', { max });
        }
        if (issue.origin === 'array' || issue.origin === 'set') {
          return t('tooMany', { max });
        }
        return t('tooBig', { max });
      }

      case 'invalid_format': {
        if (issue.format === 'email') {
          return t('invalidEmail');
        }
        if (issue.format === 'url') {
          return t('invalidUrl');
        }
        return t('invalidFormat');
      }

      case 'not_multiple_of':
        return t('notMultipleOf', { divisor: String(issue.divisor) });

      case 'unrecognized_keys':
        return t('unrecognizedKeys');

      case 'invalid_value':
        return t('invalidValue');

      // invalid_union / invalid_key / invalid_element / custom →
      // Zod defaultiga yoki sxema-darajadagi xabarga tushsin
      default:
        return undefined;
    }
  };
}

/** Global Zod konfiguratsiyasini i18n error map bilan o'rnatadi. */
export function installZodErrorMap(i18n: I18nInstance): void {
  z.config({ customError: buildZodErrorMap(i18n) });
}

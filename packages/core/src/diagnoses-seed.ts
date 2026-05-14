/**
 * ICD-10 Dental Diagnoses (K00-K14) — platform-level seed.
 * Boot vaqtida idempotent upsert qilinadi.
 *
 * Bu ro'yxat MVP uchun eng keng tarqalgan diagnozlar.
 * Phase 2 da to'liq ICD-10 (yuzlab kod) qo'shilishi mumkin.
 */

export const DIAGNOSES_SEED = [
  // K00 — Disturbances of tooth development and eruption
  {
    code: 'K00.0',
    category: 'K00',
    nameUz: "Adontiya (tug'ma tishsizlik)",
    nameRu: 'Адентия (врождённое отсутствие зубов)',
  },
  {
    code: 'K00.1',
    category: 'K00',
    nameUz: 'Tishlarning ortiqcha yetishishi (giperdontiya)',
    nameRu: 'Сверхкомплектные зубы',
  },
  {
    code: 'K00.2',
    category: 'K00',
    nameUz: "Tish o'lcham va shaklining anomaliyalari",
    nameRu: 'Аномалии размеров и формы зубов',
  },
  {
    code: 'K00.6',
    category: 'K00',
    nameUz: 'Tishlarning yorib chiqishidagi buzilishlar',
    nameRu: 'Нарушения прорезывания зубов',
  },

  // K01 — Embedded and impacted teeth
  {
    code: 'K01.0',
    category: 'K01',
    nameUz: 'Yashirin tish',
    nameRu: 'Ретинированные зубы',
  },
  {
    code: 'K01.1',
    category: 'K01',
    nameUz: 'Yorib chiqmagan tish (impaktsiya)',
    nameRu: 'Импактные зубы',
  },

  // K02 — Caries (kariyes)
  {
    code: 'K02.0',
    category: 'K02',
    nameUz: "Emal kariyesi (boshlang'ich)",
    nameRu: 'Кариес эмали',
  },
  {
    code: 'K02.1',
    category: 'K02',
    nameUz: "Dentin kariyesi (o'rta)",
    nameRu: 'Кариес дентина',
  },
  {
    code: 'K02.2',
    category: 'K02',
    nameUz: 'Sement kariyesi',
    nameRu: 'Кариес цемента',
  },
  {
    code: 'K02.3',
    category: 'K02',
    nameUz: "To'xtab qolgan kariyes",
    nameRu: 'Приостановившийся кариес',
  },
  {
    code: 'K02.5',
    category: 'K02',
    nameUz: 'Pulpa ochiq kariyes',
    nameRu: 'Кариес с обнажением пульпы',
  },
  {
    code: 'K02.9',
    category: 'K02',
    nameUz: 'Kariyes (aniqlanmagan)',
    nameRu: 'Кариес неуточнённый',
  },

  // K03 — Other diseases of hard tissues of teeth
  {
    code: 'K03.0',
    category: 'K03',
    nameUz: 'Tishlarning haddan tashqari yeyilishi (abraziya)',
    nameRu: 'Повышенное стирание зубов',
  },
  {
    code: 'K03.1',
    category: 'K03',
    nameUz: 'Tish abraziyasi (mehnatga oid)',
    nameRu: 'Сошлифовывание зубов',
  },
  {
    code: 'K03.2',
    category: 'K03',
    nameUz: 'Tish eroziyasi',
    nameRu: 'Эрозия зубов',
  },
  {
    code: 'K03.4',
    category: 'K03',
    nameUz: 'Tishlarning haddan tashqari sementlanishi',
    nameRu: 'Гиперцементоз',
  },
  {
    code: 'K03.6',
    category: 'K03',
    nameUz: "Tish dog'lari (depozit)",
    nameRu: 'Отложения (наросты) на зубах',
  },
  {
    code: 'K03.7',
    category: 'K03',
    nameUz: "Tishning rangini o'zgarishi",
    nameRu: 'Изменения цвета зубов',
  },

  // K04 — Diseases of pulp and periapical tissues
  {
    code: 'K04.0',
    category: 'K04',
    nameUz: "Pulpit (pulpa yallig'lanishi)",
    nameRu: 'Пульпит',
  },
  {
    code: 'K04.1',
    category: 'K04',
    nameUz: 'Pulpa nekrozi',
    nameRu: 'Некроз пульпы',
  },
  {
    code: 'K04.4',
    category: 'K04',
    nameUz: "O'tkir apikal periodontit",
    nameRu: 'Острый апикальный периодонтит',
  },
  {
    code: 'K04.5',
    category: 'K04',
    nameUz: 'Surunkali apikal periodontit',
    nameRu: 'Хронический апикальный периодонтит',
  },
  {
    code: 'K04.6',
    category: 'K04',
    nameUz: 'Periapikal abssess (fistula bilan)',
    nameRu: 'Периапикальный абсцесс со свищом',
  },
  {
    code: 'K04.7',
    category: 'K04',
    nameUz: 'Periapikal abssess (fistulasiz)',
    nameRu: 'Периапикальный абсцесс без свища',
  },

  // K05 — Gingivitis and periodontal diseases
  {
    code: 'K05.0',
    category: 'K05',
    nameUz: "O'tkir gingivit",
    nameRu: 'Острый гингивит',
  },
  {
    code: 'K05.1',
    category: 'K05',
    nameUz: 'Surunkali gingivit',
    nameRu: 'Хронический гингивит',
  },
  {
    code: 'K05.2',
    category: 'K05',
    nameUz: "O'tkir periodontit",
    nameRu: 'Острый пародонтит',
  },
  {
    code: 'K05.3',
    category: 'K05',
    nameUz: 'Surunkali periodontit',
    nameRu: 'Хронический пародонтит',
  },
  {
    code: 'K05.4',
    category: 'K05',
    nameUz: 'Parodontoz',
    nameRu: 'Пародонтоз',
  },

  // K06 — Other disorders of gingiva and edentulous alveolar ridge
  {
    code: 'K06.0',
    category: 'K06',
    nameUz: 'Milkning chekinishi (gingival retsessiya)',
    nameRu: 'Рецессия десны',
  },
  {
    code: 'K06.1',
    category: 'K06',
    nameUz: 'Milkning kattalashishi (giperplaziya)',
    nameRu: 'Гипертрофия десны',
  },
  {
    code: 'K06.8',
    category: 'K06',
    nameUz: 'Milkning boshqa belgilangan kasalliklari',
    nameRu: 'Другие уточнённые поражения десны',
  },

  // K07 — Dentofacial anomalies (including malocclusion)
  {
    code: 'K07.0',
    category: 'K07',
    nameUz: "Yuq jag' o'lchami anomaliyalari",
    nameRu: 'Основные аномалии размеров челюстей',
  },
  {
    code: 'K07.2',
    category: 'K07',
    nameUz: 'Tish qator anomaliyalari',
    nameRu: 'Аномалии соотношения зубных дуг',
  },
  {
    code: 'K07.3',
    category: 'K07',
    nameUz: 'Tish joylashishidagi anomaliyalar',
    nameRu: 'Аномалии положения зубов',
  },
  {
    code: 'K07.4',
    category: 'K07',
    nameUz: 'Tishlar yopilishi (malokluziya) — aniqlanmagan',
    nameRu: 'Аномалия прикуса неуточнённая',
  },

  // K08 — Other disorders of teeth and supporting structures
  {
    code: 'K08.0',
    category: 'K08',
    nameUz: "Tishlar yo'qotilishi (sistemik kasalliklar tufayli)",
    nameRu: 'Эксфолиация зубов',
  },
  {
    code: 'K08.1',
    category: 'K08',
    nameUz: "Tish yo'qotilishi (jarohat yoki tortib olishdan)",
    nameRu: 'Потеря зубов вследствие травмы',
  },
  {
    code: 'K08.3',
    category: 'K08',
    nameUz: "Tish ildizi qoldig'i",
    nameRu: 'Оставшийся корень зуба',
  },

  // K09 — Cysts of oral region
  {
    code: 'K09.0',
    category: 'K09',
    nameUz: "Tish o'sishi bilan bog'liq kistalar",
    nameRu: 'Одонтогенные кисты',
  },

  // K12 — Stomatitis and related lesions
  {
    code: 'K12.0',
    category: 'K12',
    nameUz: 'Aftoz stomatit',
    nameRu: 'Афтозный стоматит',
  },
  {
    code: 'K12.1',
    category: 'K12',
    nameUz: 'Stomatit (boshqa shakllari)',
    nameRu: 'Другие формы стоматита',
  },

  // K13 — Other diseases of lip and oral mucosa
  {
    code: 'K13.0',
    category: 'K13',
    nameUz: 'Lab kasalliklari (xeylit)',
    nameRu: 'Болезни губ (хейлит)',
  },

  // K14 — Diseases of tongue
  {
    code: 'K14.0',
    category: 'K14',
    nameUz: "Glossit (til yallig'lanishi)",
    nameRu: 'Глоссит',
  },
] as const;

/**
 * Platform-level permissions katalog (source of truth).
 *
 * ⚠️ Bu fayl `as const` array — TypeScript compile-time type safety beradi:
 *  - `Permission` type — barcha kodlarning union
 *  - `requirePermission<P extends Permission>(code: P)` — typoga ruxsat bermaydi
 *  - Frontend role builder UI ham shu type'ni ishlatadi
 *
 * 🔄 DB seed: Backend boot vaqtida idempotent `INSERT ... ON CONFLICT (code) DO UPDATE` ishlatadi.
 * Yangi permission qo'shish jarayoni:
 *   1. Quyidagi array'ga yangi entry qo'shing
 *   2. Backend deploy (boot'da DB seed avtomatik ishlaydi)
 *   3. Tenant admin yangi rol/role tahrirlash orqali shu permission'ni ishlatadi
 */

export const PERMISSIONS = [
  // ===== Tenant management =====
  {
    code: 'tenant.view',
    category: 'tenant',
    descriptionUz: "Klinika ma'lumotlarini ko'rish",
    descriptionRu: 'Просмотр данных клиники',
  },
  {
    code: 'tenant.edit',
    category: 'tenant',
    descriptionUz: "Klinika ma'lumotlarini tahrirlash",
    descriptionRu: 'Редактирование данных клиники',
  },
  {
    code: 'tenant.delete',
    category: 'tenant',
    descriptionUz: "Klinikani o'chirish (faqat egasi)",
    descriptionRu: 'Удаление клиники (только владелец)',
  },
  {
    code: 'tenant.transfer_ownership',
    category: 'tenant',
    descriptionUz: 'Klinika egaligini boshqa foydalanuvchiga uzatish',
    descriptionRu: 'Передача владения клиникой',
  },
  {
    code: 'tenant_settings.view',
    category: 'tenant',
    descriptionUz: "Klinika sozlamalarini ko'rish",
    descriptionRu: 'Просмотр настроек клиники',
  },
  {
    code: 'tenant_settings.edit',
    category: 'tenant',
    descriptionUz: 'Klinika sozlamalarini tahrirlash',
    descriptionRu: 'Редактирование настроек клиники',
  },

  // ===== Branches (filiallar) =====
  {
    code: 'branch.view',
    category: 'branch',
    descriptionUz: "Filiallarni ko'rish",
    descriptionRu: 'Просмотр филиалов',
  },
  {
    code: 'branch.create',
    category: 'branch',
    descriptionUz: 'Yangi filial yaratish',
    descriptionRu: 'Создание филиала',
  },
  {
    code: 'branch.edit',
    category: 'branch',
    descriptionUz: 'Filialni tahrirlash',
    descriptionRu: 'Редактирование филиала',
  },
  {
    code: 'branch.delete',
    category: 'branch',
    descriptionUz: "Filialni o'chirish",
    descriptionRu: 'Удаление филиала',
  },

  // ===== Roles & permissions management =====
  {
    code: 'role.view',
    category: 'rbac',
    descriptionUz: "Rollarni ko'rish",
    descriptionRu: 'Просмотр ролей',
  },
  {
    code: 'role.manage',
    category: 'rbac',
    descriptionUz: "Rollarni yaratish/tahrirlash/o'chirish",
    descriptionRu: 'Управление ролями',
  },
  {
    code: 'permission.view',
    category: 'rbac',
    descriptionUz: "Ruxsatlar katalogini ko'rish",
    descriptionRu: 'Просмотр каталога разрешений',
  },

  // ===== User management =====
  {
    code: 'user.view',
    category: 'user',
    descriptionUz: "Xodimlarni ko'rish",
    descriptionRu: 'Просмотр пользователей',
  },
  {
    code: 'user.invite',
    category: 'user',
    descriptionUz: 'Xodimni taklif qilish',
    descriptionRu: 'Приглашение пользователя',
  },
  {
    code: 'user.manage',
    category: 'user',
    descriptionUz: 'Xodimlar assignmentlarini boshqarish',
    descriptionRu: 'Управление назначениями пользователей',
  },
  {
    code: 'user.deactivate',
    category: 'user',
    descriptionUz: 'Xodimni faolsizlantirish',
    descriptionRu: 'Деактивация пользователя',
  },

  // ===== Audit log =====
  {
    code: 'audit_log.view',
    category: 'audit',
    descriptionUz: "Audit log ko'rish",
    descriptionRu: 'Просмотр журнала аудита',
  },

  // ===== Notifications =====
  {
    code: 'notification.view',
    category: 'notification',
    descriptionUz: "Notification jurnalini ko'rish",
    descriptionRu: 'Просмотр журнала уведомлений',
  },
  {
    code: 'notification.manage',
    category: 'notification',
    descriptionUz: 'Notification sozlamalari va test SMS yuborish',
    descriptionRu: 'Управление уведомлениями',
  },

  // ===== M2 shell permissions (patient/staff — actual usage M2'da) =====
  {
    code: 'patient.view',
    category: 'patient',
    descriptionUz: "Bemorlarni ko'rish",
    descriptionRu: 'Просмотр пациентов',
  },
  {
    code: 'patient.create',
    category: 'patient',
    descriptionUz: "Yangi bemor qo'shish",
    descriptionRu: 'Создание пациента',
  },
  {
    code: 'patient.edit',
    category: 'patient',
    descriptionUz: 'Bemorni tahrirlash',
    descriptionRu: 'Редактирование пациента',
  },
  {
    code: 'patient.delete',
    category: 'patient',
    descriptionUz: 'Bemorni arxivlash',
    descriptionRu: 'Архивирование пациента',
  },
  {
    code: 'patient.view_pii',
    category: 'patient',
    descriptionUz: "Bemor PII (pasport, telefon) ko'rish",
    descriptionRu: 'Просмотр персональных данных пациента',
  },
  {
    code: 'medical_record.view',
    category: 'clinical',
    descriptionUz: "Tibbiy karta ko'rish",
    descriptionRu: 'Просмотр медкарты',
  },
  {
    code: 'medical_record.edit',
    category: 'clinical',
    descriptionUz: 'Tibbiy karta tahrirlash',
    descriptionRu: 'Редактирование медкарты',
  },
  {
    code: 'staff.view',
    category: 'staff',
    descriptionUz: "Xodimlarni ko'rish",
    descriptionRu: 'Просмотр сотрудников',
  },
  {
    code: 'staff.invite',
    category: 'staff',
    descriptionUz: 'Xodim taklif qilish (HR)',
    descriptionRu: 'Приглашение сотрудника',
  },
  {
    code: 'staff.edit',
    category: 'staff',
    descriptionUz: 'Xodim profilini tahrirlash',
    descriptionRu: 'Редактирование профиля сотрудника',
  },
  {
    code: 'staff.delete',
    category: 'staff',
    descriptionUz: 'Xodimni arxivlash',
    descriptionRu: 'Архивирование сотрудника',
  },

  // ===== M3 shell permissions (appointment, queue, cashier, service) =====
  {
    code: 'appointment.view',
    category: 'appointment',
    descriptionUz: "Yozilishlarni ko'rish",
    descriptionRu: 'Просмотр записей',
  },
  {
    code: 'appointment.create',
    category: 'appointment',
    descriptionUz: 'Yangi yozilish',
    descriptionRu: 'Создание записи',
  },
  {
    code: 'appointment.edit',
    category: 'appointment',
    descriptionUz: 'Yozilishni tahrirlash',
    descriptionRu: 'Редактирование записи',
  },
  {
    code: 'appointment.cancel',
    category: 'appointment',
    descriptionUz: 'Yozilishni bekor qilish',
    descriptionRu: 'Отмена записи',
  },
  {
    code: 'queue.view',
    category: 'queue',
    descriptionUz: "Navbatni ko'rish",
    descriptionRu: 'Просмотр очереди',
  },
  {
    code: 'queue.create',
    category: 'queue',
    descriptionUz: 'Navbatga yozish',
    descriptionRu: 'Добавление в очередь',
  },
  {
    code: 'queue.manage',
    category: 'queue',
    descriptionUz: 'Navbat statusini boshqarish',
    descriptionRu: 'Управление статусом очереди',
  },
  {
    code: 'service.view',
    category: 'service',
    descriptionUz: "Xizmatlar katalogini ko'rish",
    descriptionRu: 'Просмотр услуг',
  },
  {
    code: 'service.manage',
    category: 'service',
    descriptionUz: 'Xizmatlar katalogini boshqarish',
    descriptionRu: 'Управление услугами',
  },
  {
    code: 'cashier.view',
    category: 'cashier',
    descriptionUz: "Kassa operatsiyalarini ko'rish",
    descriptionRu: 'Просмотр кассы',
  },
  {
    code: 'cashier.create_transaction',
    category: 'cashier',
    descriptionUz: "Kassa to'lovi yaratish",
    descriptionRu: 'Создание кассовой операции',
  },
  {
    code: 'cashier.refund',
    category: 'cashier',
    descriptionUz: "To'lovni qaytarish",
    descriptionRu: 'Возврат платежа',
  },
  {
    code: 'cashier.void',
    category: 'cashier',
    descriptionUz: "To'lovni bekor qilish",
    descriptionRu: 'Отмена платежа',
  },
  {
    code: 'report.view',
    category: 'report',
    descriptionUz: "Hisobotlarni ko'rish",
    descriptionRu: 'Просмотр отчётов',
  },
  {
    code: 'salary.view',
    category: 'salary',
    descriptionUz: "Ish haqi hisobotlarini ko'rish",
    descriptionRu: 'Просмотр зарплат',
  },

  // ===== M5 shell permissions (prescriptions, consent, lab orders, patient images) =====
  {
    code: 'prescription.view',
    category: 'clinical',
    descriptionUz: "Reseptlarni ko'rish",
    descriptionRu: 'Просмотр рецептов',
  },
  {
    code: 'prescription.manage',
    category: 'clinical',
    descriptionUz: 'Reseptlarni yaratish/tahrirlash',
    descriptionRu: 'Управление рецептами',
  },
  {
    code: 'consent.view',
    category: 'clinical',
    descriptionUz: "Konsent (rozilik) formalarini ko'rish",
    descriptionRu: 'Просмотр согласий',
  },
  {
    code: 'consent.manage',
    category: 'clinical',
    descriptionUz: 'Konsent shablonlarini va imzolarni boshqarish',
    descriptionRu: 'Управление согласиями',
  },
  {
    code: 'lab_order.view',
    category: 'clinical',
    descriptionUz: "Laboratoriya buyurtmalarini ko'rish",
    descriptionRu: 'Просмотр лаб. заказов',
  },
  {
    code: 'lab_order.manage',
    category: 'clinical',
    descriptionUz: 'Laboratoriya buyurtmalarini yaratish/yangilash',
    descriptionRu: 'Управление лаб. заказами',
  },
  {
    code: 'patient_image.view',
    category: 'clinical',
    descriptionUz: "Bemor rasmlarini (X-ray va boshqa) ko'rish",
    descriptionRu: 'Просмотр снимков пациента',
  },
  {
    code: 'patient_image.upload',
    category: 'clinical',
    descriptionUz: 'Bemor rasmlarini yuklash va boshqarish',
    descriptionRu: 'Загрузка снимков пациента',
  },

  // ===== R4 Guruh A permissions (expenses, stock) =====
  {
    code: 'expense.view',
    category: 'expense',
    descriptionUz: "Xarajatlarni ko'rish",
    descriptionRu: 'Просмотр расходов',
  },
  {
    code: 'expense.manage',
    category: 'expense',
    descriptionUz: 'Xarajatlar va kategoriyalarni boshqarish',
    descriptionRu: 'Управление расходами и категориями',
  },
  {
    code: 'stock.view',
    category: 'stock',
    descriptionUz: "Ombor qoldiqlari va harakatlarini ko'rish",
    descriptionRu: 'Просмотр склада и движений',
  },
  {
    code: 'stock.manage',
    category: 'stock',
    descriptionUz: 'Ombor harakatlari va material normalarini boshqarish',
    descriptionRu: 'Управление складом и нормами материалов',
  },

  // ===== R4 Guruh B permissions (payroll) =====
  {
    code: 'payroll.view',
    category: 'payroll',
    descriptionUz: "Ish haqi (payroll) hisob-kitoblarini ko'rish",
    descriptionRu: 'Просмотр расчётов заработной платы',
  },
  {
    code: 'payroll.manage',
    category: 'payroll',
    descriptionUz: 'Ish haqi hisoblash (run) yaratish va yakunlash',
    descriptionRu: 'Создание и финализация расчётов заработной платы',
  },

  // ===== Epic A permissions (doctor schedule / availability) =====
  {
    code: 'schedule.view',
    category: 'schedule',
    descriptionUz: "Ish jadvali, time-off va bo'sh vaqtlarni ko'rish",
    descriptionRu: 'Просмотр графика, отгулов и доступного времени',
  },
  {
    code: 'schedule.manage',
    category: 'schedule',
    descriptionUz: 'Ish jadvali va time-off yozuvlarini boshqarish',
    descriptionRu: 'Управление графиком работы и отгулами',
  },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['code'];
export type PermissionDef = (typeof PERMISSIONS)[number];

/** Group permissions by category — UI role builder uchun. */
export const PERMISSIONS_BY_CATEGORY = PERMISSIONS.reduce<Record<string, readonly PermissionDef[]>>(
  (acc, p) => {
    const existing = acc[p.category];
    acc[p.category] = existing ? [...existing, p] : [p];
    return acc;
  },
  {},
);

/** Owner-only permissions — bu kodlarni rol orqali bermaslik kerak. */
export const OWNER_ONLY_PERMISSIONS = ['tenant.delete', 'tenant.transfer_ownership'] as const;
export type OwnerOnlyPermission = (typeof OWNER_ONLY_PERMISSIONS)[number];

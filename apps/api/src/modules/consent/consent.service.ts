import { consentForms, consentTemplates } from '@dental/db-schema';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  CrossEntityError,
  createOwnershipValidator,
  type OwnershipValidator,
} from '../../lib/ownership.ts';
import type { CreateTemplateInput, SignFormInput, UpdateTemplateInput } from './consent.schema.ts';

export const createConsentService = (deps: {
  audit: AuditLogger;
  ownership?: OwnershipValidator;
}) => {
  const ownership = deps.ownership ?? createOwnershipValidator();
  // ===== Templates =====
  async function listTemplates(c: Context, type?: string, activeOnly = true) {
    const db = getDb(c);
    const filters = [];
    if (type) filters.push(eq(consentTemplates.type, type as 'treatment'));
    if (activeOnly) filters.push(eq(consentTemplates.isActive, true));
    const rows = await db
      .select()
      .from(consentTemplates)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(consentTemplates.createdAt));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'consent_template',
      resourceId: null,
      after: { type: type ?? null, count: rows.length },
    });
    return rows;
  }

  async function getTemplate(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(consentTemplates).where(eq(consentTemplates.id, id));
    if (row) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'consent_template',
        resourceId: id,
      });
    }
    return row ?? null;
  }

  async function createTemplate(c: Context, input: CreateTemplateInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    const [row] = await db
      .insert(consentTemplates)
      .values({
        tenantId,
        type: input.type,
        title: input.title,
        bodyUz: input.bodyUz,
        bodyRu: input.bodyRu ?? null,
        isActive: input.isActive,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'consent_template',
        resourceId: row.id,
        after: { type: row.type, title: row.title },
      });
    }
    return row;
  }

  async function updateTemplate(c: Context, id: string, input: UpdateTemplateInput) {
    const db = getDb(c);
    const [before] = await db.select().from(consentTemplates).where(eq(consentTemplates.id, id));
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.type) patch.type = input.type;
    if (input.title) patch.title = input.title;
    if (input.bodyUz) patch.bodyUz = input.bodyUz;
    if (input.bodyRu !== undefined) patch.bodyRu = input.bodyRu;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const [row] = await db
      .update(consentTemplates)
      .set(patch)
      .where(eq(consentTemplates.id, id))
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'consent_template',
        resourceId: id,
        before,
        after: row,
      });
    }
    return row;
  }

  // ===== Signed forms =====
  async function listForms(c: Context, patientId?: string) {
    const db = getDb(c);
    const filters = [];
    if (patientId) filters.push(eq(consentForms.patientId, patientId));
    const rows = await db
      .select()
      .from(consentForms)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(consentForms.signedAt));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'consent_form',
      resourceId: patientId ?? null,
      after: { patientId: patientId ?? null, count: rows.length },
    });
    return rows;
  }

  async function signForm(c: Context, input: SignFormInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId || !user) throw new Error('No tenant context');

    // CLI-484: cross-entity ownership — patientId shu tenantga tegishlimi (FK
    // RLS'ni chetlab o'tadi: cross-tenant/mavjud bo'lmagan UUID xom 500 o'rniga toza
    // CrossEntityError → routes 400; prescriptions.create patterni). templateId
    // ixtiyoriy — berilsa, RLS-scoped select bilan shu tenantnikimi tekshiriladi
    // (FK cross-tenant template'ni ham qabul qilardi).
    await ownership.assertPatientExists(c, input.patientId);
    if (input.templateId) {
      const [template] = await db
        .select({ id: consentTemplates.id })
        .from(consentTemplates)
        .where(eq(consentTemplates.id, input.templateId))
        .limit(1);
      if (!template) throw new CrossEntityError('consent_template', 'not_found');
    }

    const [row] = await db
      .insert(consentForms)
      .values({
        tenantId,
        patientId: input.patientId,
        templateId: input.templateId ?? null,
        type: input.type,
        title: input.title,
        bodyText: input.bodyText,
        language: input.language,
        signedByUserId: user.id,
        patientSignatureName: input.patientSignatureName ?? null,
        notes: input.notes ?? null,
        // CLI-461
        isPerpetual: input.isPerpetual,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .returning();

    if (row) {
      await deps.audit.record(c, {
        action: 'signed',
        resourceType: 'consent_form',
        resourceId: row.id,
        after: { patientId: input.patientId, type: input.type },
      });
    }
    return row;
  }

  return {
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    listForms,
    signForm,
  };
};

export type ConsentService = ReturnType<typeof createConsentService>;

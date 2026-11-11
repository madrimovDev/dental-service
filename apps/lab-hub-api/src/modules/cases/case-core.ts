import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db/client';
import {
  type Case,
  type CaseEventType,
  type CaseStatus,
  caseEvents,
  caseFiles,
  caseMessages,
  clinics,
  labs,
  labUsers,
} from '../../db/schema';
import { decryptOptional, encryptBuffer, encryptString, type Key } from '../../lib/crypto';
import { ApiError } from '../../lib/errors';
import type { Storage } from '../../lib/storage';

/** Ish holat o'tishlari (spec §2.3). */
export const LAB_TRANSITIONS: Record<
  'accepted' | 'in_progress' | 'ready' | 'rejected',
  CaseStatus[]
> = {
  accepted: ['sent', 'remake'],
  in_progress: ['accepted'],
  ready: ['accepted', 'in_progress'],
  rejected: ['sent', 'remake', 'accepted'],
};

export const loadLab = async (tx: Tx, labId: string) => {
  const lab = await tx.query.labs.findFirst({ where: eq(labs.id, labId) });
  if (!lab) throw new ApiError(404, 'lab.not_found');
  return lab;
};

export const recordEvent = async (
  tx: Tx,
  ev: {
    caseRow: Pick<Case, 'id' | 'labId' | 'clinicId'>;
    type: CaseEventType;
    actor: 'clinic' | 'lab' | 'system';
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  },
) => {
  const [row] = await tx
    .insert(caseEvents)
    .values({
      labId: ev.caseRow.labId,
      clinicId: ev.caseRow.clinicId,
      caseId: ev.caseRow.id,
      type: ev.type,
      actor: ev.actor,
      actorUserId: ev.actorUserId ?? null,
      payload: ev.payload ?? {},
    })
    .returning({ seq: caseEvents.seq });
  return row!.seq;
};

export const toCaseDto = (c: Case, dek: Key, extra: { clinicName?: string | null } = {}) => ({
  id: c.id,
  labId: c.labId,
  clinicId: c.clinicId,
  clinicName: extra.clinicName ?? null,
  clinicCaseRef: c.clinicCaseRef,
  patientName: decryptOptional(dek, c.patientNameEnc),
  patientSex: c.patientSex,
  patientAge: c.patientAge,
  clinicCode: c.clinicCode,
  doctorName: c.doctorName,
  teeth: c.teeth,
  workType: c.workType,
  material: c.material,
  shade: decryptOptional(dek, c.shadeEnc),
  dueDate: c.dueDate,
  note: decryptOptional(dek, c.noteEnc),
  status: c.status,
  rejectReason: c.rejectReason,
  assignedTechnicianId: c.assignedTechnicianId,
  proposedPrice: c.proposedPrice,
  approvedPrice: c.approvedPrice,
  approvedAt: c.approvedAt?.toISOString() ?? null,
  sentAt: c.sentAt.toISOString(),
  readyAt: c.readyAt?.toISOString() ?? null,
  deliveredAt: c.deliveredAt?.toISOString() ?? null,
  purgedAt: c.purgedAt?.toISOString() ?? null,
  updatedAt: c.updatedAt.toISOString(),
});

/** Ish detali: fayllar ro'yxati + yozishma (deshifrlangan) + so'nggi hodisalar. */
export const caseDetail = async (tx: Tx, c: Case, dek: Key) => {
  const [files, messages, events, clinic, tech] = await Promise.all([
    tx
      .select()
      .from(caseFiles)
      .where(and(eq(caseFiles.caseId, c.id), isNull(caseFiles.deletedAt)))
      .orderBy(asc(caseFiles.createdAt)),
    tx
      .select()
      .from(caseMessages)
      .where(eq(caseMessages.caseId, c.id))
      .orderBy(asc(caseMessages.createdAt)),
    tx
      .select()
      .from(caseEvents)
      .where(eq(caseEvents.caseId, c.id))
      .orderBy(desc(caseEvents.seq))
      .limit(100),
    tx.query.clinics.findFirst({ where: eq(clinics.id, c.clinicId), columns: { name: true } }),
    c.assignedTechnicianId
      ? tx.query.labUsers.findFirst({
          where: eq(labUsers.id, c.assignedTechnicianId),
          columns: { fullName: true },
        })
      : Promise.resolve(undefined),
  ]);
  return {
    case: {
      ...toCaseDto(c, dek, { clinicName: clinic?.name }),
      technicianName: tech?.fullName ?? null,
    },
    files: files.map((f) => ({
      id: f.id,
      fileName: decryptOptional(dek, f.fileNameEnc),
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      uploadedBy: f.uploadedBy,
      createdAt: f.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author,
      authorName: m.authorName,
      body: decryptOptional(dek, m.bodyEnc),
      fileId: m.fileId,
      createdAt: m.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      seq: e.seq,
      type: e.type,
      actor: e.actor,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  };
};

export const addMessage = async (
  tx: Tx,
  c: Case,
  dek: Key,
  m: {
    author: 'clinic' | 'lab';
    authorName?: string | null;
    body: string;
    actorUserId?: string | null;
  },
) => {
  const [row] = await tx
    .insert(caseMessages)
    .values({
      labId: c.labId,
      clinicId: c.clinicId,
      caseId: c.id,
      author: m.author,
      authorName: m.authorName ?? null,
      bodyEnc: encryptString(dek, m.body),
    })
    .returning();
  await recordEvent(tx, {
    caseRow: c,
    type: 'message',
    actor: m.author,
    actorUserId: m.actorUserId,
    payload: { messageId: row!.id, author: m.author },
  });
  return row!;
};

const ALLOWED_MIME =
  /^(image\/(jpeg|png|webp|heic)|application\/(pdf|octet-stream|sla|zip)|model\/(stl|obj|ply|3mf)|text\/plain)$/;

/** Multipart fayl: shifrlab diskka, metama'lumot bazaga; DB xatosida blob o'chiriladi. */
export const addFile = async (
  tx: Tx,
  storage: Storage,
  c: Case,
  dek: Key,
  file: File,
  opts: { uploadedBy: 'clinic' | 'lab'; maxBytes: number; actorUserId?: string | null },
) => {
  if (c.purgedAt) throw new ApiError(409, 'case.purged');
  if (file.size === 0) throw new ApiError(400, 'file.empty');
  if (file.size > opts.maxBytes) throw new ApiError(413, 'file.too_large');
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.test(mime)) throw new ApiError(415, 'file.unsupported_type');
  const plain = Buffer.from(await file.arrayBuffer());
  const key = await storage.put(c.labId, encryptBuffer(dek, plain));
  try {
    const [row] = await tx
      .insert(caseFiles)
      .values({
        labId: c.labId,
        clinicId: c.clinicId,
        caseId: c.id,
        uploadedBy: opts.uploadedBy,
        fileNameEnc: encryptString(dek, file.name || 'file'),
        mimeType: mime,
        sizeBytes: plain.length,
        storageKey: key,
      })
      .returning();
    await recordEvent(tx, {
      caseRow: c,
      type: 'file',
      actor: opts.uploadedBy,
      actorUserId: opts.actorUserId,
      payload: {
        fileId: row!.id,
        mimeType: mime,
        sizeBytes: plain.length,
        uploadedBy: opts.uploadedBy,
      },
    });
    return {
      id: row!.id,
      fileName: file.name || 'file',
      mimeType: mime,
      sizeBytes: plain.length,
      uploadedBy: opts.uploadedBy,
      createdAt: row!.createdAt.toISOString(),
    };
  } catch (err) {
    await storage.remove(key).catch(() => {});
    throw err;
  }
};

export const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

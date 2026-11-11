export const caseRow = (over: Record<string, unknown> = {}) => ({
  id: 'c-231',
  labId: 'lab-1',
  clinicId: 'cl-1',
  clinicName: 'Smile Dent (Chilonzor)',
  clinicCaseRef: 'ref-231',
  patientName: 'Kamola Ergasheva',
  patientSex: 'female',
  patientAge: 47,
  clinicCode: 'SD-1187',
  doctorName: 'Dr. Yusupova',
  teeth: [34, 35, 36],
  workType: 'Ko‘prik',
  material: 'sirkoniy',
  shade: 'A3',
  dueDate: '2026-11-19',
  note: 'oraliq milkka tegmasin',
  status: 'accepted',
  rejectReason: null,
  assignedTechnicianId: null,
  proposedPrice: null,
  approvedPrice: null,
  approvedAt: null,
  sentAt: '2026-11-10T08:00:00.000Z',
  readyAt: null,
  deliveredAt: null,
  purgedAt: null,
  updatedAt: '2026-11-10T08:00:00.000Z',
  ...over,
});

export const detail = (over: Record<string, unknown> = {}) => ({
  case: { ...caseRow(over), technicianName: null },
  files: [
    {
      id: 'f1',
      fileName: 'upper.stl',
      mimeType: 'model/stl',
      sizeBytes: 2048,
      uploadedBy: 'clinic',
      createdAt: '2026-11-10T08:01:00.000Z',
    },
    {
      id: 'f2',
      fileName: 'smile.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 4096,
      uploadedBy: 'clinic',
      createdAt: '2026-11-10T08:02:00.000Z',
    },
  ],
  messages: [
    {
      id: 'm1',
      author: 'clinic',
      authorName: 'Dr. Yusupova',
      body: 'Antagonist skani ham qo‘shdim',
      fileId: null,
      createdAt: '2026-11-10T10:12:00.000Z',
    },
  ],
  events: [],
});

export const users = [
  {
    id: 't1',
    fullName: 'Shoxrux Olimov',
    phone: '+998901000001',
    role: 'technician',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 't2',
    fullName: 'Akmal Yusupov',
    phone: '+998901000002',
    role: 'technician',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'u-lead',
    fullName: 'Lab Rahbari',
    phone: '+998901112233',
    role: 'lead',
    isActive: true,
    mustChangePassword: false,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

export const priceItems = [
  { id: 'p1', workType: 'Ko‘prik', material: 'sirkoniy', price: '1800000.00', isActive: true },
  { id: 'p2', workType: 'Toj', material: 'E.max', price: '900000.00', isActive: true },
];

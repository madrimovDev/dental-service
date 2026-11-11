// Nusxa: packages/core/src/phone.ts (apps/supervisor-api/src/lib/phone.ts naqshi —
// alohida deploy birligi, @dental/* bog'liqligi yo'q). Qoida o'zgarsa — hammasi birga.
export const normalizePhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 9 ? `998${digits}` : digits;
  return `+${withCountry}`;
};

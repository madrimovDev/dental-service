/**
 * FU-15: `GET /auth/me` → `phoneVerified` (taklifni qabul qilish sharti).
 * Maydon yo'q / noaniq bo'lsa — tasdiqlanmagan (UI yopiq tomonda; server baribir majburlaydi).
 * TODO(generate): generate:contract'dan keyin generated `MembershipsResponse.phoneVerified`.
 */
export const isPhoneVerified = (me: unknown): boolean =>
  (me as { phoneVerified?: boolean } | undefined)?.phoneVerified === true;

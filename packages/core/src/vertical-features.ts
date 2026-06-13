export const VERTICALS = ['dental', 'general'] as const;
export type Vertical = (typeof VERTICALS)[number];

export type VerticalFeature = 'odontogram' | 'labOrders';

export const VERTICAL_FEATURES: Record<Vertical, Record<VerticalFeature, boolean>> = {
  dental: { odontogram: true, labOrders: true },
  general: { odontogram: false, labOrders: false },
};

/** Berilgan vertical mazkur feature'ni yoqadimi. Noma'lum vertical → false. */
export const hasFeature = (vertical: Vertical, feature: VerticalFeature): boolean =>
  VERTICAL_FEATURES[vertical]?.[feature] ?? false;

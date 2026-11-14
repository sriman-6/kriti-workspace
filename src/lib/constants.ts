export const CAMPUSES = ['PIL', 'GOA', 'HYD', 'DXB'] as const;
export type Campus = (typeof CAMPUSES)[number];
export const CAMPUS_LABELS: Record<Campus, string> = {
  PIL: 'Pilani',
  GOA: 'Goa',
  HYD: 'Hyderabad',
  DXB: 'Dubai',
};
export const USER_ROLES = ['super_admin', 'member'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Workspace administrator',
  member: 'KRITI Member',
};
export const BITS_EMAIL_DOMAINS = [
  'bits-pilani.ac.in',
  'pilani.bits-pilani.ac.in',
  'goa.bits-pilani.ac.in',
  'hyderabad.bits-pilani.ac.in',
  'dubai.bits-pilani.ac.in',
] as const;
export const CAMPUS_BY_EMAIL_DOMAIN: Record<string, Campus> = {
  'pilani.bits-pilani.ac.in': 'PIL',
  'goa.bits-pilani.ac.in': 'GOA',
  'hyderabad.bits-pilani.ac.in': 'HYD',
  'dubai.bits-pilani.ac.in': 'DXB',
};

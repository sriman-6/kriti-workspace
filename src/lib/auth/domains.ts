import { BITS_EMAIL_DOMAINS, CAMPUS_BY_EMAIL_DOMAIN, type Campus } from '@/lib/constants';

/**
 * BITS email domain rules.
 *
 * Pure and dependency-free so the rule can be unit-tested directly — it is the
 * default rule for sign-in and onboarding. An external address additionally
 * needs approval on its exact registered account.
 */

export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

/** Official campus domains and the institute domain used by KRITI leadership. */
export function isAllowedBitsEmail(email: string): boolean {
  const domain = emailDomain(email);
  return (BITS_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

export function isAllowedGoogleEmail(email: string, account?: {
  email: string;
  externalGoogleApproved: boolean;
} | null): boolean {
  return isAllowedBitsEmail(email) || Boolean(account?.externalGoogleApproved &&
    email.trim().toLowerCase() === account.email.trim().toLowerCase());
}

/** The campus a BITS address belongs to, or null if it is not a BITS address. */
export function campusForEmail(email: string): Campus | null {
  return CAMPUS_BY_EMAIL_DOMAIN[emailDomain(email)] ?? null;
}

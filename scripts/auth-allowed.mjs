/** Wspólna lista dozwolonych kont (skrypty Node + dokumentacja). */
export const ALLOWED_AUTH_EMAILS = [
    'dawidrekal@gmail.com',
    'test@test.pl'
];

export const DEMO_ACCOUNT_EMAIL = 'test@test.pl';

/** Firebase Auth wymaga min. 6 znaków — „test” jest za krótkie; używamy test00. */
export const DEMO_ACCOUNT_PASSWORD = 'test00';

export function normalizeAuthEmail(email) {
    return String(email || '').trim().toLowerCase();
}

export function isAllowedAuthEmail(email) {
    const normalized = normalizeAuthEmail(email);
    return ALLOWED_AUTH_EMAILS.some((allowed) => normalizeAuthEmail(allowed) === normalized);
}

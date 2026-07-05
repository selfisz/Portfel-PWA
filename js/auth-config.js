/** Dozwolone konta logowania (sync: scripts/auth-allowed.mjs). */
const ALLOWED_AUTH_EMAILS = [
    'dawidrekal@gmail.com',
    'test@test.pl'
];

const DEMO_ACCOUNT_EMAIL = 'test@test.pl';

function normalizeAuthEmailConfig(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmailAllowedInConfig(email) {
    const normalized = normalizeAuthEmailConfig(email);
    return ALLOWED_AUTH_EMAILS.some((allowed) => normalizeAuthEmailConfig(allowed) === normalized);
}

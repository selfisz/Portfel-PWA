/** Dozwolone konta logowania (sync: scripts/auth-allowed.mjs). */
const ALLOWED_AUTH_EMAILS = [
    'dawidrekal@gmail.com',
    'test@test.pl'
];

const DEMO_ACCOUNT_EMAIL = 'test@test.pl';
const DEMO_ACCOUNT_UID = 'dAYNFGQhHkVKVUATV10t8CQ6j6O2';

function normalizeAuthEmailConfig(email) {
    return String(email || '').trim().toLowerCase();
}

function isEmailAllowedInConfig(email) {
    const normalized = normalizeAuthEmailConfig(email);
    return ALLOWED_AUTH_EMAILS.some((allowed) => normalizeAuthEmailConfig(allowed) === normalized);
}

function isDemoFinanceUid(uid) {
    return uid === DEMO_ACCOUNT_UID;
}

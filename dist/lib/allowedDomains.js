export const ALLOWED_EMAIL_DOMAINS = ['gamemybiz.com', 'johnnytsunami.com'];
export function isEmailDomainAllowed(email) {
    const normalized = String(email).trim().toLowerCase();
    const at = normalized.lastIndexOf('@');
    if (at === -1)
        return false;
    const domain = normalized.slice(at + 1);
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

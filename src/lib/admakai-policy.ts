export const ADMAKAI_CALLBACKS = [
  "https://admakai.com/auth/sso/callback",
  "https://www.admakai.com/auth/sso/callback",
  "https://admakai.lovable.app/auth/sso/callback",
  "https://id-preview--501d0449-9e53-4830-89e1-c51ec60b3911.lovable.app/auth/sso/callback",
  "https://501d0449-9e53-4830-89e1-c51ec60b3911.lovableproject.com/auth/sso/callback",
] as const;
export function isAdmakaiCallback(uri: string): boolean {
  return ADMAKAI_CALLBACKS.some((callback) => callback === uri);
}
export function mapAdmakaiRole(roles: readonly string[]): "owner" | "manager" | "member" | null {
  if (roles.includes("super_admin")) return "owner";
  if (roles.includes("admin") || roles.includes("manager")) return "manager";
  if (roles.includes("user")) return "member";
  return null;
}
export function canAccessAdmakai(input: { roles: readonly string[]; hasProfile: boolean; deactivatedAt: string | null; bannedUntil: string | null }, now = Date.now()): boolean {
  return input.hasProfile && !input.deactivatedAt &&
    !(input.bannedUntil && new Date(input.bannedUntil).getTime() > now) && mapAdmakaiRole(input.roles) !== null;
}
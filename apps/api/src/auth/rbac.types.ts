export const APP_ROLES = [
  'VIEWER',
  'OPERATOR',
  'MANAGER',
  'ADMIN',
  'OWNER',
  'SUPER_ADMIN',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  role: AppRole;
  permissions: string[];
}

const ROLE_LEVELS = new Map<AppRole, number>(
  APP_ROLES.map((role, index) => [role, index]),
);

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && ROLE_LEVELS.has(value as AppRole);
}

export function hasRequiredRole(actualRole: unknown, requiredRoles: readonly AppRole[]): boolean {
  if (!isAppRole(actualRole)) return false;
  if (requiredRoles.length === 0) return true;

  const actualLevel = ROLE_LEVELS.get(actualRole) ?? -1;
  return requiredRoles.some((requiredRole) => {
    const requiredLevel = ROLE_LEVELS.get(requiredRole);
    return requiredLevel !== undefined && actualLevel >= requiredLevel;
  });
}

export function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((permission): permission is string => typeof permission === 'string')
      .map((permission) => permission.trim())
      .filter(Boolean),
  )];
}

export function hasPermission(grantedPermissions: readonly string[], requiredPermission: string): boolean {
  return grantedPermissions.some((grantedPermission) => {
    if (grantedPermission === '*' || grantedPermission === requiredPermission) return true;
    if (!grantedPermission.endsWith('.*')) return false;

    const namespace = grantedPermission.slice(0, -1);
    return requiredPermission.startsWith(namespace);
  });
}


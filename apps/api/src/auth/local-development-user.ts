import { AuthenticatedUser, isAppRole, normalizePermissions } from './rbac.types';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLocalDevelopmentRequest(request: RequestLike): boolean {
  return process.env.NODE_ENV !== 'production'
    && (
      LOOPBACK_ADDRESSES.has(request.socket?.remoteAddress ?? '')
      || process.env.LOCAL_DEV_AUTH_BYPASS === 'true'
    );
}

export function hasBearerToken(request: RequestLike): boolean {
  const authorization = request.headers?.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return typeof value === 'string' && /^Bearer\s+\S+/i.test(value);
}

export function createLocalDevelopmentUser(): AuthenticatedUser {
  const configuredRole = process.env.LOCAL_DEV_ROLE;
  const role = isAppRole(configuredRole) ? configuredRole : 'SUPER_ADMIN';
  const configuredPermissions = process.env.LOCAL_DEV_PERMISSIONS;

  return {
    id: 'local-development-user',
    email: 'local-development@localhost',
    organizationId: process.env.LOCAL_DEV_ORGANIZATION_ID || 'default-org',
    role,
    permissions: configuredPermissions === undefined
      ? ['*']
      : normalizePermissions(configuredPermissions.split(',')),
  };
}

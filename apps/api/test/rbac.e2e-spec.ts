import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { AddressInfo } from 'net';
import { Permissions } from '../src/auth/permissions.decorator';
import { Roles } from '../src/auth/roles.decorator';
import { RolesGuard } from '../src/auth/roles.guard';
import { JwtAuthGuard } from '../src/auth/jwt.guard';
import { isLocalDevelopmentRequest } from '../src/auth/local-development-user';

@Injectable()
class HeaderIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const role = request.headers['x-test-role'];
    if (!role) return true;

    request.user = {
      id: 'test-user',
      email: 'rbac@test.local',
      organizationId: 'test-org',
      role,
      permissions: String(request.headers['x-test-permissions'] ?? '')
        .split(',')
        .map((permission) => permission.trim())
        .filter(Boolean),
    };
    return true;
  }
}

@Controller('rbac')
@UseGuards(HeaderIdentityGuard, RolesGuard)
class RbacTestController {
  @Get('open')
  open() {
    return { allowed: true };
  }

  @Get('manager')
  @Roles('MANAGER')
  manager() {
    return { allowed: true };
  }

  @Get('publish')
  @Roles('OPERATOR')
  @Permissions('jobs.publish', 'devices.control')
  publish() {
    return { allowed: true };
  }

  @Get('content-read')
  @Permissions('content.read')
  contentRead() {
    return { allowed: true };
  }
}

describe('RBAC primitives', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RbacTestController],
      providers: [HeaderIdentityGuard, RolesGuard, Reflector],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/rbac`;
  });

  afterAll(async () => app.close());

  async function get(path: string, role?: string, permissions?: string[]) {
    const headers: Record<string, string> = {};
    if (role) headers['x-test-role'] = role;
    if (permissions) headers['x-test-permissions'] = permissions.join(',');
    return fetch(`${baseUrl}/${path}`, { headers });
  }

  it('allows routes without RBAC metadata', async () => {
    expect((await get('open')).status).toBe(200);
  });

  it('requires an authenticated user when metadata is present', async () => {
    expect((await get('manager')).status).toBe(401);
  });

  it('enforces the role hierarchy', async () => {
    expect((await get('manager', 'OPERATOR')).status).toBe(403);
    expect((await get('manager', 'MANAGER')).status).toBe(200);
    expect((await get('manager', 'ADMIN')).status).toBe(200);
    expect((await get('manager', 'OWNER')).status).toBe(200);
  });

  it('rejects unknown roles', async () => {
    expect((await get('manager', 'ROOT')).status).toBe(403);
  });

  it('requires every declared permission', async () => {
    expect((await get('publish', 'OPERATOR', ['jobs.publish'])).status).toBe(403);
    expect((await get('publish', 'OPERATOR', ['jobs.publish', 'devices.control'])).status).toBe(200);
  });

  it('supports namespace wildcard permissions', async () => {
    expect((await get('content-read', 'VIEWER', ['content.*'])).status).toBe(200);
  });

  it('grants SUPER_ADMIN all permissions', async () => {
    expect((await get('publish', 'SUPER_ADMIN')).status).toBe(200);
  });
});

describe('local JWT development principal', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRole = process.env.LOCAL_DEV_ROLE;
  const previousPermissions = process.env.LOCAL_DEV_PERMISSIONS;

  afterEach(() => {
    restoreEnvironment('NODE_ENV', previousNodeEnv);
    restoreEnvironment('LOCAL_DEV_ROLE', previousRole);
    restoreEnvironment('LOCAL_DEV_PERMISSIONS', previousPermissions);
  });

  function restoreEnvironment(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
      return;
    }
    process.env[name] = value;
  }

  it('preserves loopback development access with an explicit principal', () => {
    process.env.NODE_ENV = 'development';
    process.env.LOCAL_DEV_ROLE = 'MANAGER';
    process.env.LOCAL_DEV_PERMISSIONS = 'content.read,jobs.*';
    const request: any = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(new JwtAuthGuard().canActivate(context)).toBe(true);
    expect(request.user).toMatchObject({
      role: 'MANAGER',
      permissions: ['content.read', 'jobs.*'],
    });
  });

  it('never treats production or remote requests as local development', () => {
    process.env.NODE_ENV = 'production';
    expect(isLocalDevelopmentRequest({ socket: { remoteAddress: '127.0.0.1' } })).toBe(false);

    process.env.NODE_ENV = 'development';
    expect(isLocalDevelopmentRequest({ socket: { remoteAddress: '10.0.0.20' } })).toBe(false);
  });
});

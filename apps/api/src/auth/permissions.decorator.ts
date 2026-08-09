import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'farm-phone:permissions';

export const Permissions = (...permissions: string[]) => SetMetadata(
  PERMISSIONS_KEY,
  [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))],
);


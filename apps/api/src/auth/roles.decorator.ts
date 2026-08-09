import { SetMetadata } from '@nestjs/common';
import { AppRole } from './rbac.types';

export const ROLES_KEY = 'farm-phone:roles';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);


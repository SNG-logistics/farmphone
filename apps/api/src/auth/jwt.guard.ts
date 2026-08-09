import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  createLocalDevelopmentUser,
  hasBearerToken,
  isLocalDevelopmentRequest,
} from './local-development-user';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (isLocalDevelopmentRequest(request)) {
      if (!hasBearerToken(request)) {
        request.user = createLocalDevelopmentUser();
        return true;
      }
      try {
        const can = await (super.canActivate(context) as Promise<boolean>);
        if (can) return true;
      } catch {
        request.user = createLocalDevelopmentUser();
        return true;
      }
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}

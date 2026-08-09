import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class DeviceAgentGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const configured = process.env.DEVICE_AGENT_TOKEN || '';
    const supplied = request.headers['x-device-agent-token'];
    const address = request.socket?.remoteAddress || '';
    const local = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
    if (configured && supplied === configured) return true;
    if (process.env.NODE_ENV !== 'production' && local) return true;
    throw new UnauthorizedException('Invalid device agent token');
  }
}

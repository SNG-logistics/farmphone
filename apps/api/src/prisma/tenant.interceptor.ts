import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const organizationId = request.user?.organizationId
      || request.headers?.['x-organization-id']
      || (process.env.NODE_ENV !== 'production' ? 'default-org' : undefined);
    return new Observable((subscriber) => {
      TenantContext.run({ organizationId, role: request.user?.role }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}

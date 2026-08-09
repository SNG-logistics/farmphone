import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

export interface ErrorLogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  message: string;
  stack?: string;
}

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly recentErrors: ErrorLogEntry[] = [];
  private readonly MAX_ERROR_LOG = 50;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    const method = request.method || 'UNKNOWN';
    const url = request.url || request.originalUrl || '/';
    const userAgent = request.headers?.['user-agent'] || '-';
    const ip = request.ip || request.connection?.remoteAddress || '-';
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const elapsed = Date.now() - startTime;
        const statusCode = response.statusCode || 200;
        const icon = this.getSpeedIcon(elapsed);

        this.logger.log(
          `${icon} ${method} ${url} ${statusCode} ${elapsed}ms — ${ip} "${userAgent.slice(0, 60)}"`,
        );
      }),
      catchError((error) => {
        const elapsed = Date.now() - startTime;
        const statusCode = error.status || error.statusCode || 500;
        const message = error.message || 'Internal Server Error';

        this.logger.error(
          `🔴 ${method} ${url} ${statusCode} ${elapsed}ms — ${ip} — ${message}`,
        );

        // Store in recent error log for system status dashboard
        this.recentErrors.unshift({
          timestamp: new Date().toISOString(),
          method,
          url,
          statusCode,
          message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        });

        // Cap the error log size
        if (this.recentErrors.length > this.MAX_ERROR_LOG) {
          this.recentErrors.length = this.MAX_ERROR_LOG;
        }

        return throwError(() => error);
      }),
    );
  }

  private getSpeedIcon(ms: number): string {
    if (ms < 100) return '🟢';
    if (ms < 500) return '🟡';
    return '🔴';
  }

  /** Get recent error log entries for the system status dashboard */
  getRecentErrors(): ErrorLogEntry[] {
    return [...this.recentErrors];
  }
}

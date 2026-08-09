import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Recursively converts any Firestore Timestamp-like object
 * { _seconds, _nanoseconds } or { seconds, nanoseconds } to ISO-8601 string
 * before the response is JSON-serialized and sent to the client.
 *
 * This is the authoritative safeguard that prevents React children errors
 * caused by Firestore Timestamp objects leaking into the frontend.
 */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Firestore Timestamp instance (has .toDate() method)
  if (typeof (value as any)?.toDate === 'function') {
    return (value as any).toDate().toISOString();
  }

  // Plain serialized Timestamp object: { _seconds: N, _nanoseconds: N }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const secs = obj['_seconds'] ?? obj['seconds'];
    if (typeof secs === 'number') {
      return new Date(secs * 1000).toISOString();
    }

    // Recurse into nested plain objects
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sanitize(v);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map(sanitize);
  }

  return value;
}

@Injectable()
export class TimestampSanitizeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(sanitize));
  }
}

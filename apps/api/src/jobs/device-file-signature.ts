import { createHmac, timingSafeEqual } from 'crypto';

/** Default signed-URL TTL in seconds (5 minutes). Override via FILE_URL_TTL_SECONDS env var. */
const DEFAULT_TTL_SECONDS = 300;

function secret() {
  return process.env.FILE_URL_SECRET || process.env.JWT_SECRET || 'local-device-file-secret';
}

function ttlSeconds() {
  const v = parseInt(process.env.FILE_URL_TTL_SECONDS || '', 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_SECONDS;
}

/** Structured result returned by URL-signing helpers. */
export interface SignedUrl {
  url: string;
  fileId: string;
  expiresAt: Date;
}

/**
 * Build an HMAC-SHA256 signature over `${fileId}:${expiresAt}`.
 * Including the expiry epoch in the payload means old signatures are
 * automatically invalidated once the token expires.
 */
export function signDeviceFile(fileId: string, expiresAt: number): string {
  return createHmac('sha256', secret())
    .update(`${fileId}:${expiresAt}`)
    .digest('hex');
}

/**
 * Verify an HMAC signature for a given file ID and expiry epoch.
 * Returns false if the signature is wrong OR the token has already expired.
 */
export function verifyDeviceFileSignature(fileId: string, supplied: string, expiresAt: number): boolean {
  if (Date.now() > expiresAt) return false;
  const expected = Buffer.from(signDeviceFile(fileId, expiresAt));
  const actual = Buffer.from(String(supplied || ''));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Generate a time-limited signed URL for viewing screenshot evidence
 * via `GET /api/v1/devices/files/:fileId/view`.
 */
export function deviceFileViewUrl(fileId: string): SignedUrl {
  const expiresAt = Date.now() + ttlSeconds() * 1_000;
  const signature = signDeviceFile(fileId, expiresAt);
  const url = `/api/v1/devices/files/${encodeURIComponent(fileId)}/view?signature=${signature}&expiresAt=${expiresAt}`;
  return { url, fileId, expiresAt: new Date(expiresAt) };
}

/**
 * Generate a time-limited signed URL for downloading a queued PUSH_FILE payload
 * via `GET /api/v1/devices/files/:fileId/download`.
 */
export function deviceFileDownloadUrl(fileId: string): SignedUrl {
  const expiresAt = Date.now() + ttlSeconds() * 1_000;
  const signature = signDeviceFile(fileId, expiresAt);
  const url = `/api/v1/devices/files/${encodeURIComponent(fileId)}/download?signature=${signature}&expiresAt=${expiresAt}`;
  return { url, fileId, expiresAt: new Date(expiresAt) };
}

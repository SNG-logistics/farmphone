export const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

const DEFAULT_TIMEOUT_MS = 8_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

export async function apiFetch(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = init.signal;
  const abortFromUpstream = () => controller.abort();

  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true });
  }

  try {
    return await fetch(`${apiUrl}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Backend API ไม่ตอบภายใน ${Math.ceil(timeoutMs / 1000)} วินาที (${apiUrl})`);
    }
    if (error instanceof TypeError) {
      throw new Error(`เชื่อมต่อ Backend API ไม่ได้ (${apiUrl}) กรุณาเปิด API, PostgreSQL และ Redis`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    upstreamSignal?.removeEventListener('abort', abortFromUpstream);
  }
}

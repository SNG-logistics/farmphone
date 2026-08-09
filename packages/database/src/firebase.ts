import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

import * as fs from 'fs';
import * as path from 'path';

export let firebaseApp: App | null = null;
let firebaseAvailable = false;

function tryInitFirebase(): App | null {
  const apps = getApps();
  if (apps.length > 0) {
    firebaseAvailable = true;
    return apps[0]!;
  }

  const serviceAccountEnvPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    'firebase-service-account.json';

  const projectId = process.env.FIREBASE_PROJECT_ID || 'farmphone-b9f7c';
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || 'farmphone-b9f7c.firebasestorage.app';

  const possiblePaths = [
    path.resolve(serviceAccountEnvPath),
    path.resolve(process.cwd(), serviceAccountEnvPath),
    path.resolve(process.cwd(), '../../', serviceAccountEnvPath),
    path.resolve(__dirname, '../../../../', serviceAccountEnvPath),
  ];

  let credentialPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      credentialPath = p;
      break;
    }
  }

  if (!credentialPath) {
    console.warn('[Firebase] ⚠️  No service account found — using in-memory storage (dev mode)');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    // Use the service account's own project_id when FIREBASE_PROJECT_ID is not
    // set in the process environment yet (Nest ConfigModule loads .env after
    // module imports, so process.env may not have it during Firestore init).
    const effectiveProjectId = serviceAccount.project_id || projectId || 'farmphone-b9f7c';
    const effectiveBucket = process.env.FIREBASE_STORAGE_BUCKET
      ? storageBucket
      : `${effectiveProjectId}.firebasestorage.app`;
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: effectiveProjectId,
      storageBucket: effectiveBucket,
    });
    firebaseAvailable = true;
    console.log(`[Firebase] ✅ Connected to project: ${effectiveProjectId} using ${credentialPath}`);
    return app;
  } catch (err) {
    console.warn('[Firebase] ⚠️  Failed to initialize with service account:', (err as Error).message);
    return null;
  }

}

firebaseApp = tryInitFirebase();

// In-memory store for dev mode (no Firebase credentials)
const inMemoryStore = new Map<string, Map<string, Record<string, unknown>>>();

function getCollection(collectionName: string): Map<string, Record<string, unknown>> {
  if (!inMemoryStore.has(collectionName)) {
    inMemoryStore.set(collectionName, new Map());
  }
  return inMemoryStore.get(collectionName)!;
}

let _realFirestore: Firestore | null = null;

function getOrCreateFirestore(): Firestore | null {
  if (_realFirestore) return _realFirestore;
  if (!firebaseApp || !firebaseAvailable) return null;
  try {
    _realFirestore = getFirestore(firebaseApp);
    return _realFirestore;
  } catch {
    return null;
  }
}

// Firestore — real if available, in-memory fallback otherwise
export const firestore = {
  collection(name: string) {
    const real = getOrCreateFirestore();
    if (real) return real.collection(name);

    const coll = getCollection(name);
    const self = {
      doc(id: string) {
        return {
          get: async () => ({ exists: coll.has(id), data: () => coll.get(id) ?? null, id }),
          set: async (data: Record<string, unknown>) => { coll.set(id, { ...data }); },
          update: async (data: Record<string, unknown>) => {
            const existing = coll.get(id) ?? {};
            coll.set(id, { ...existing, ...data });
          },
          delete: async () => { coll.delete(id); },
        };
      },
      where() { return self; },
      orderBy() { return self; },
      limit() { return self; },
      async get() {
        return {
          docs: Array.from(coll.entries()).map(([id, data]) => ({ id, exists: true, data: () => ({ ...data, id }) })),
          empty: coll.size === 0,
          size: coll.size,
        };
      },
      async count() { return { data: () => ({ count: coll.size }) }; },
      withConverter() { return self; },
    };
    return self;
  },
  settings() {},
} as unknown as Firestore;

let _auth: ReturnType<typeof getAuth> | null = null;
export const auth = {
  async verifyIdToken(token: string) {
    if (!firebaseApp || !firebaseAvailable) return { uid: 'dev-user', token };
    try {
      _auth ??= getAuth(firebaseApp);
      return _auth.verifyIdToken(token);
    } catch {
      return { uid: 'dev-user', token };
    }
  },
};

let _storage: ReturnType<typeof getStorage> | null = null;
export const storage = {
  bucket(name?: string) {
    const mockFile = {
      save: async () => {},
      getSignedUrl: async () => [''],
      download: async () => [Buffer.from('')],
      exists: async () => [false],
    };
    if (!firebaseApp || !firebaseAvailable) return { file: () => mockFile } as unknown as ReturnType<ReturnType<typeof getStorage>['bucket']>;
    try {
      _storage ??= getStorage(firebaseApp);
      return _storage.bucket(name);
    } catch {
      return { file: () => mockFile } as unknown as ReturnType<ReturnType<typeof getStorage>['bucket']>;
    }
  },
};

export function fromTimestamp(ts: Timestamp | null | undefined): string | null {
  return ts ? ts.toDate().toISOString() : null;
}

export function toTimestamp(iso: string | null | undefined): Timestamp | null {
  return iso ? Timestamp.fromDate(new Date(iso)) : null;
}

export function serializeForFirestore<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (value instanceof Date) result[key] = Timestamp.fromDate(value);
    else if (Array.isArray(value)) result[key] = value.map((v) => (v instanceof Date ? Timestamp.fromDate(v) : v));
    else result[key] = value;
  }
  return result;
}

export function deserializeFromFirestore<T>(data: DocumentData): T {
  if (!data || typeof data !== 'object') return data as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = value;
    } else if (value instanceof Timestamp || (typeof (value as any)?.toDate === 'function')) {
      result[key] = (value as any).toDate().toISOString();
    } else if (typeof value === 'object' && ('_seconds' in value || 'seconds' in value) && typeof ((value as any)._seconds ?? (value as any).seconds) === 'number') {
      const secs = (value as any)._seconds ?? (value as any).seconds;
      result[key] = new Date(secs * 1000).toISOString();
    } else if (typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value)) {
      result[key] = deserializeFromFirestore(value as DocumentData);
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) => (v && typeof v === 'object' ? deserializeFromFirestore(v as DocumentData) : v));
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

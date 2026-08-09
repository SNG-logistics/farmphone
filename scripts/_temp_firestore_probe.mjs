import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
import path from 'node:path';

const saPath = path.resolve('firebase-service-account.json');
console.log('service account:', saPath, fs.existsSync(saPath));

const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
console.log('project_id:', sa.project_id);
console.log('client_email:', sa.client_email);

const app = initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore(app);

try {
  const snap = await db.collection('devices').limit(5).get();
  console.log('READ devices OK, count:', snap.size);
} catch (e) {
  console.error('READ ERROR:', e.code, e.message);
}

try {
  const probeRef = db.collection('_probe').doc(`test-${Date.now()}`);
  await probeRef.set({ ok: true, at: new Date().toISOString() });
  console.log('WRITE OK');
  const doc = await probeRef.get();
  console.log('WRITE VERIFY exists:', doc.exists);
  await probeRef.delete();
  console.log('DELETE OK');
} catch (e) {
  console.error('WRITE/DELETE ERROR:', e.code, e.message);
}

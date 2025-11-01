import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';

const projectId = process.env.FIREBASE_PROJECT_ID;

let app;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  app = initializeApp({ credential: cert(svc), projectId });
} else {
  app = initializeApp({
    credential: applicationDefault(),
    projectId
  });
}
export const db = getFirestore(app);
export const serverTimestamp = FieldValue.serverTimestamp;

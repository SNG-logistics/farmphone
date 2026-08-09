import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { initializeApp, cert, getApps, getApp, App } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: App | null = null;

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const apps = getApps();
    if (apps.length > 0) {
      this.firebaseApp = getApp();
      this.logger.log('Firebase Admin SDK already initialized.');
      return;
    }

    const serviceAccountEnvPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      'firebase-service-account.json';

    // Search candidate paths for firebase-service-account.json
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

    try {
      if (credentialPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
        this.firebaseApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
        this.logger.log(`Firebase Admin SDK successfully initialized using credentials at: ${credentialPath}`);
      } else {
        this.firebaseApp = initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
        this.logger.log('Firebase Admin SDK initialized with project ID.');
      }
    } catch (error: any) {
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${error?.message || error}`);
    }
  }

  getApp(): App {
    if (!this.firebaseApp) {
      throw new Error('Firebase Admin SDK is not initialized.');
    }
    return this.firebaseApp;
  }

  messaging(): Messaging {
    return getMessaging(this.getApp());
  }

  auth(): Auth {
    return getAuth(this.getApp());
  }

  firestore(): Firestore {
    return getFirestore(this.getApp());
  }

  storage(): Storage {
    return getStorage(this.getApp());
  }
}

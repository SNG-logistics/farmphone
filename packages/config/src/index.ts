// FARM PHONE AI OFFICE — Shared Configuration

export const appConfig = {
  name: 'Farm Phone AI Office',
  version: '1.0.0',
  port: parseInt(process.env.API_PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
};

type JwtDurationUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y';
type JwtDuration = `${number}${JwtDurationUnit}`;

function readJwtDuration(name: string, fallback: JwtDuration): JwtDuration {
  const value = process.env[name] || fallback;
  if (!/^\d+(?:ms|s|m|h|d|w|y)$/.test(value)) {
    throw new Error(`${name} must be a duration such as 15m, 24h, or 7d`);
  }
  return value as JwtDuration;
}

export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
  expiresIn: readJwtDuration('JWT_EXPIRES_IN', '24h'),
  refreshExpiresIn: readJwtDuration('JWT_REFRESH_EXPIRES_IN', '7d'),
};

export const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0'),
};

export const minioConfig = {
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin_secret',
  bucket: process.env.MINIO_BUCKET || 'farm-phone-media',
  useSSL: process.env.MINIO_USE_SSL === 'true',
};

export const deviceAgentConfig = {
  port: parseInt(process.env.DEVICE_AGENT_PORT || '3100'),
  nodeId: process.env.NODE_ID || 'NODE-A',
  deviceCode: process.env.DEVICE_CODE || 'PHONE-001',
  androidDeviceSerial: process.env.ANDROID_DEVICE_SERIAL || '',
  targetAndroidPackage: process.env.TARGET_ANDROID_PACKAGE || '',
  adbPath: process.env.ADB_PATH || 'adb',
  simulatorMode: process.env.SIMULATOR_MODE === 'true',
  simulatorCount: parseInt(process.env.SIMULATOR_DEVICE_COUNT || '1'),
};

export const workerConfig = {
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1'),
};

export const billingConfig = {
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
};

export const aiConfig = {
  apiKey: process.env.COMETAPI_API_KEY || '',
  baseUrl: process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1',
  model: process.env.COMETAPI_MODEL || 'gpt-4o',
  miniModel: process.env.COMETAPI_MINI_MODEL || 'gpt-4o-mini',
};

export const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'farmphone-b9f7c',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'farmphone-b9f7c.firebasestorage.app',
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json',
};

import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Client } from 'minio';
import { minioConfig } from '@farm-phone/config';
import { storage as firebaseStorage, firebaseApp } from '@farm-phone/database';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private minioAvailable = false;
  private lastMinioError: unknown = null;
  private readonly client = new Client({
    endPoint: minioConfig.endPoint,
    port: minioConfig.port,
    useSSL: minioConfig.useSSL,
    accessKey: minioConfig.accessKey,
    secretKey: minioConfig.secretKey,
  });

  async onModuleInit() {
    try {
      await this.ensureMinioBucket();
      this.minioAvailable = true;
      this.logger.log(`MinIO ready at ${minioConfig.endPoint}:${minioConfig.port}/${minioConfig.bucket}`);
    } catch (error) {
      this.lastMinioError = error;
      this.minioAvailable = false;
      this.logger.warn(`MinIO unavailable, using Firebase Storage fallback: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async upload(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
    const extension = file.originalname.includes('.') ? `.${file.originalname.split('.').pop()}` : '';
    const objectName = `content/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${extension}`;

    if (this.minioAvailable) {
      try {
        await this.client.putObject(minioConfig.bucket, objectName, file.buffer, file.size, {
          'Content-Type': file.mimetype,
          'X-Amz-Meta-Original-Name': encodeURIComponent(file.originalname),
        });
        return {
          objectName,
          url: `minio://${minioConfig.bucket}/${objectName}`,
          previewUrl: await this.client.presignedGetObject(minioConfig.bucket, objectName, 24 * 60 * 60),
        };
      } catch (err) {
        this.lastMinioError = err;
        this.minioAvailable = false;
      }
    }

    if (firebaseApp) {
      try {
        const bucket = firebaseStorage.bucket();
        const fbFile = bucket.file(objectName);
        await fbFile.save(file.buffer, { contentType: file.mimetype });
        const [signedUrl] = await fbFile.getSignedUrl({ action: 'read', expires: Date.now() + 24 * 60 * 60 * 1000 }).catch(() => ['']);
        return {
          objectName,
          url: `firebase://${objectName}`,
          previewUrl: signedUrl || `https://storage.googleapis.com/${minioConfig.bucket}/${objectName}`,
        };
      } catch (err) {
        this.logger.warn(`Firebase Storage upload error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new ServiceUnavailableException(this.unavailableMessage(this.lastMinioError));
  }

  async uploadEvidence(buffer: Buffer, jobId: string) {
    const stored = await this.storeEvidence(buffer, jobId);
    return stored.previewUrl;
  }

  async storeEvidence(buffer: Buffer, jobId: string) {
    const objectName = `evidence/${jobId}/${Date.now()}.png`;

    if (this.minioAvailable) {
      try {
        await this.client.putObject(minioConfig.bucket, objectName, buffer, buffer.length, { 'Content-Type': 'image/png' });
        return {
          objectName,
          url: `minio://${minioConfig.bucket}/${objectName}`,
          previewUrl: await this.client.presignedGetObject(minioConfig.bucket, objectName, 7 * 24 * 60 * 60),
        };
      } catch (err) {
        this.lastMinioError = err;
        this.minioAvailable = false;
      }
    }

    if (firebaseApp) {
      try {
        const bucket = firebaseStorage.bucket();
        const fbFile = bucket.file(objectName);
        await fbFile.save(buffer, { contentType: 'image/png' });
        const [signedUrl] = await fbFile.getSignedUrl({ action: 'read', expires: Date.now() + 7 * 24 * 60 * 60 * 1000 }).catch(() => ['']);
        return {
          objectName,
          url: `firebase://${objectName}`,
          previewUrl: signedUrl || `data:image/png;base64,${buffer.toString('base64')}`,
        };
      } catch (err) {
        this.logger.warn(`Firebase Storage storeEvidence error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      objectName,
      url: `file://${objectName}`,
      previewUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    };
  }

  async downloadBuffer(url: string) {
    if (url.startsWith('minio://') && this.minioAvailable) {
      const objectName = this.objectName(url);
      const stream = await this.client.getObject(minioConfig.bucket, objectName);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    }

    if (url.startsWith('firebase://')) {
      const objectName = url.slice('firebase://'.length);
      const bucket = firebaseStorage.bucket();
      const [buffer] = await (bucket.file(objectName) as any).download();
      return buffer;
    }

    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1] || '';
      return Buffer.from(base64Data, 'base64');
    }

    throw new Error(`Unsupported storage URL format: ${url}`);
  }

  async downloadToTemp(url: string) {
    const filename = `farm-phone-${randomUUID()}-${url.split('/').pop() || 'content.mp4'}`;
    const localPath = join(tmpdir(), filename);

    if (url.startsWith('minio://') && this.minioAvailable) {
      const objectName = this.objectName(url);
      await this.client.fGetObject(minioConfig.bucket, objectName, localPath);
      return localPath;
    }

    const buffer = await this.downloadBuffer(url);
    await fs.writeFile(localPath, buffer);
    return localPath;
  }

  async removeTemp(localPath: string) {
    if (!localPath.startsWith(tmpdir())) return;
    await fs.unlink(localPath).catch(() => undefined);
  }

  private async ensureMinioBucket() {
    try {
      const exists = await this.client.bucketExists(minioConfig.bucket);
      if (!exists) await this.client.makeBucket(minioConfig.bucket);
    } catch (error) {
      throw new ServiceUnavailableException(this.unavailableMessage(error));
    }
  }

  private unavailableMessage(error: unknown) {
    if (error instanceof ServiceUnavailableException) return error.message;
    const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
    return `MinIO unavailable at ${minioConfig.endPoint}:${minioConfig.port}${detail}`;
  }

  private objectName(url: string) {
    const prefix = `minio://${minioConfig.bucket}/`;
    if (!url.startsWith(prefix)) throw new Error('URL ไม่ใช่ไฟล์ใน MinIO ของระบบ');
    return url.slice(prefix.length);
  }
}

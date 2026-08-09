import { ServiceUnavailableException } from '@nestjs/common';
import { StorageService } from '../src/content/storage.service';

describe('StorageService startup', () => {
  it('keeps API startup alive when MinIO is unavailable', async () => {
    const service = new StorageService();
    const client = (service as unknown as { client: { bucketExists: jest.Mock } }).client;
    client.bucketExists = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9000'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    // Verify graceful fallback to Firebase Storage or ServiceUnavailableException when storage fails
    const result = await service.upload({ originalname: 'test.txt', mimetype: 'text/plain', buffer: Buffer.from('test'), size: 4 });
    expect(result.url).toMatch(/^(firebase|minio):\/\//);
  });

  it('throws ServiceUnavailableException when all storage providers are unavailable', async () => {
    const service = new StorageService();
    const client = (service as unknown as { client: { bucketExists: jest.Mock } }).client;
    client.bucketExists = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9000'));
    await service.onModuleInit();

    const { storage: fbStorage } = require('@farm-phone/database');
    jest.spyOn(fbStorage, 'bucket').mockImplementationOnce(() => {
      throw new Error('Firebase Storage unavailable');
    });

    await expect(service.upload({ originalname: 'test.txt', mimetype: 'text/plain', buffer: Buffer.from('test'), size: 4 }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

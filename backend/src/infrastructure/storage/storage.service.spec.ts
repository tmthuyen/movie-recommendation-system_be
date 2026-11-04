import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { S3StorageService } from './storage.service';

// uuid v14 là ESM-only nên mock để Jest (CommonJS) load được và key ổn định.
jest.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
}));

const BUCKET = 'movie-bucket';
const PUBLIC_URL = 'https://cdn.example.com';

const makeFile = (
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File =>
  ({
    fieldname: 'file',
    originalname: 'avatar.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: 3,
    buffer: Buffer.from('abc'),
    ...overrides,
  }) as unknown as Express.Multer.File;

describe('S3StorageService', () => {
  let service: S3StorageService;
  let sendSpy: jest.SpyInstance;

  const configValues: Record<string, string> = {
    S3_REGION: 'ap-southeast-1',
    S3_ENDPOINT: 'https://s3.example.com',
    S3_ACCESS_KEY: 'access-key',
    S3_SECRET_KEY: 'secret-key',
    S3_BUCKET_NAME: BUCKET,
    S3_PUBLIC_URL: PUBLIC_URL,
  };

  const makeConfig = () => {
    const getOrThrow = jest.fn((key: string) => configValues[key]);
    return {
      config: { getOrThrow } as unknown as ConfigService,
      getOrThrow,
    };
  };

  beforeEach(() => {
    sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never);

    service = new S3StorageService(makeConfig().config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('constructor đọc đủ cấu hình S3 qua getOrThrow', () => {
    const { config, getOrThrow } = makeConfig();

    new S3StorageService(config);

    for (const key of Object.keys(configValues)) {
      expect(getOrThrow).toHaveBeenCalledWith(key);
    }
    expect(service['bucket']).toBe(BUCKET);
    expect(service['publicUrl']).toBe(PUBLIC_URL);
  });

  describe('uploadFile', () => {
    it('gửi PutObjectCommand với bucket/key/content-type và trả public URL', async () => {
      const file = makeFile();

      const url = await service.uploadFile(file, 'avatars');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: BUCKET,
        Body: file.buffer,
        ContentType: 'image/png',
      });
      expect(command.input.Key).toBe(
        'avatars/11111111-1111-4111-8111-111111111111.png',
      );
      expect(url).toBe(`${PUBLIC_URL}/${command.input.Key}`);
    });

    it('folder mặc định là uploads và giữ phần mở rộng của file', async () => {
      const url = await service.uploadFile(
        makeFile({ originalname: 'a.webp' }),
      );

      const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.Key).toBe(
        'uploads/11111111-1111-4111-8111-111111111111.webp',
      );
      expect(url).toBe(`${PUBLIC_URL}/${command.input.Key}`);
    });

    it('file không có phần mở rộng → key không có đuôi', async () => {
      await service.uploadFile(makeFile({ originalname: 'no-extension' }));

      const command = sendSpy.mock.calls[0][0] as PutObjectCommand;
      expect(command.input.Key).toBe(
        'uploads/11111111-1111-4111-8111-111111111111',
      );
    });

    it('S3 từ chối → lỗi được ném lại cho caller', async () => {
      sendSpy.mockRejectedValue(new Error('access denied'));

      await expect(service.uploadFile(makeFile())).rejects.toThrow(
        'access denied',
      );
    });
  });

  describe('deleteFile', () => {
    it('bỏ tiền tố publicUrl và gửi DeleteObjectCommand', async () => {
      await service.deleteFile(`${PUBLIC_URL}/uploads/a.png`);

      const command = sendSpy.mock.calls[0][0] as DeleteObjectCommand;
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: BUCKET,
        Key: 'uploads/a.png',
      });
    });

    it('URL ngoài publicUrl → dùng nguyên URL làm key (hành vi hiện tại)', async () => {
      await service.deleteFile('https://other.example.com/a.png');

      const command = sendSpy.mock.calls[0][0] as DeleteObjectCommand;
      expect(command.input.Key).toBe('https://other.example.com/a.png');
    });

    it('S3 lỗi → ném lại lỗi', async () => {
      sendSpy.mockRejectedValue(new Error('not found'));

      await expect(
        service.deleteFile(`${PUBLIC_URL}/uploads/missing.png`),
      ).rejects.toThrow('not found');
    });
  });

  describe('getUrl', () => {
    it('Body là string → trả string', async () => {
      sendSpy.mockResolvedValue({ Body: 'https://signed.example.com/a.png' });

      await expect(service.getUrl('uploads/a.png')).resolves.toBe(
        'https://signed.example.com/a.png',
      );
      const command = sendSpy.mock.calls[0][0] as GetObjectCommand;
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toEqual({
        Bucket: BUCKET,
        Key: 'uploads/a.png',
      });
    });

    it('Body không phải string (stream) → trả nguyên object', async () => {
      const body = { pipe: jest.fn() };
      sendSpy.mockResolvedValue({ Body: body });

      await expect(service.getUrl('uploads/a.png')).resolves.toBe(body);
    });

    it('không có Body → trả undefined (chưa được xử lý)', async () => {
      sendSpy.mockResolvedValue({});

      await expect(service.getUrl('uploads/a.png')).resolves.toBeUndefined();
    });
  });
});

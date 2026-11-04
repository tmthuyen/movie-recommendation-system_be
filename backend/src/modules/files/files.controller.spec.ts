import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { FilesController } from './files.controller';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { STORAGE_SERVICE } from '@/infrastructure/storage/storage.service';

// storage.service.ts import uuid v14 (ESM-only) → mock để Jest CJS load được.
jest.mock('uuid', () => ({
  v4: () => '11111111-1111-4111-8111-111111111111',
}));

describe('FilesController', () => {
  let app: INestApplication;
  let storage: { uploadFile: jest.Mock };

  beforeEach(async () => {
    storage = {
      uploadFile: jest.fn().mockResolvedValue('https://cdn.test/uploads/a.png'),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [{ provide: STORAGE_SERVICE, useValue: storage }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('upload ảnh png hợp lệ → 201 + envelope url, gọi storage với folder uploads', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/upload')
      .attach('file', Buffer.from('png-bytes'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      statusCode: 201,
      message: 'Upload thành công',
      result: { url: 'https://cdn.test/uploads/a.png' },
    });
    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    const [file, folder] = storage.uploadFile.mock.calls[0] as [
      Express.Multer.File,
      string,
    ];
    expect(folder).toBe('uploads');
    expect(file.originalname).toBe('avatar.png');
    expect(file.mimetype).toBe('image/png');
    expect(file.buffer.toString()).toBe('png-bytes');
  });

  it.each(['image/jpeg', 'image/jpg', 'image/webp'])(
    'chấp nhận mimetype %s',
    async contentType => {
      await request(app.getHttpServer())
        .post('/files/upload')
        .attach('file', Buffer.from('bytes'), {
          filename: 'photo.img',
          contentType,
        })
        .expect(201);

      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    },
  );

  it('mimetype không phải ảnh → 400 và không gọi storage', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/upload')
      .attach('file', Buffer.from('text'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(response.body.message).toBe(
      'Chỉ cho phép định dạng ảnh (jpg, png, webp)',
    );
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('không đính kèm file → 400 "Không tìm thấy file"', async () => {
    const response = await request(app.getHttpServer())
      .post('/files/upload')
      .field('note', 'no-file')
      .expect(400);

    expect(response.body.message).toBe('Không tìm thấy file');
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('storage lỗi → 500 (không nuốt lỗi)', async () => {
    storage.uploadFile.mockRejectedValue(new Error('S3 down'));

    await request(app.getHttpServer())
      .post('/files/upload')
      .attach('file', Buffer.from('bytes'), {
        filename: 'avatar.png',
        contentType: 'image/png',
      })
      .expect(500);

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('uploadFile trực tiếp ném BadRequestException khi không có file', async () => {
    const controller = app.get(FilesController);

    await expect(
      controller.uploadFile(undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

import { ConfigService } from '@nestjs/config';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import * as nodemailer from 'nodemailer';

import { NodemailerProvider } from './nodemailer.provider';

describe('NodemailerProvider', () => {
  let sendMailMock: jest.Mock;
  let createTransportMock: jest.Mock;

  const makeConfig = (values: Record<string, string | number | boolean> = {}) =>
    ({
      get: jest.fn((key: string, fallback?: string | number | boolean) =>
        key in values ? values[key] : fallback,
      ),
    }) as unknown as ConfigService;

  const createProvider = (
    values: Record<string, string | number | boolean> = {},
  ) => new NodemailerProvider(makeConfig(values));

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: '1' });
    createTransportMock = nodemailer.createTransport as unknown as jest.Mock;
    createTransportMock.mockReset();
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  });

  afterEach(() => jest.restoreAllMocks());

  it('khởi tạo transporter từ cấu hình MAIL_* (port chuỗi → number)', () => {
    createProvider({
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '2525',
      MAIL_SECURE: true,
      MAIL_USER: 'user@gmail.com',
      MAIL_PASS: 'secret',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 2525,
      secure: true,
      auth: { user: 'user@gmail.com', pass: 'secret' },
    });
  });

  it('dùng giá trị mặc định khi thiếu cấu hình', () => {
    createProvider();

    expect(createTransportMock).toHaveBeenCalledWith({
      host: '://gmail.com',
      port: 587,
      secure: false,
      auth: { user: '', pass: '' },
    });
  });

  it('chỉ bật TLS khi MAIL_SECURE là boolean true', () => {
    createProvider({ MAIL_SECURE: true });
    createProvider({ MAIL_SECURE: false });

    expect(createTransportMock.mock.calls[0][0].secure).toBe(true);
    expect(createTransportMock.mock.calls[1][0].secure).toBe(false);
  });

  it('MAIL_PORT dạng number cũng được dùng trực tiếp', () => {
    createProvider({ MAIL_PORT: 465 });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465 }),
    );
  });

  it('sendMail gộp from từ MAIL_FROM với options và resolve', async () => {
    const provider = createProvider({ MAIL_FROM: 'noreply@movie.vn' });

    await expect(
      provider.sendMail({
        to: 'user@example.com',
        subject: 'Xác thực',
        html: '<p>hi</p>',
      }),
    ).resolves.toBeUndefined();

    expect(sendMailMock).toHaveBeenCalledWith({
      from: 'noreply@movie.vn',
      to: 'user@example.com',
      subject: 'Xác thực',
      html: '<p>hi</p>',
    });
  });

  it('thiếu MAIL_FROM → from undefined (không chặn gửi)', async () => {
    const provider = createProvider();

    await provider.sendMail({ to: 'user@example.com', subject: 'Hi' });

    expect(sendMailMock).toHaveBeenCalledWith({
      from: undefined,
      to: 'user@example.com',
      subject: 'Hi',
    });
  });

  it('transporter lỗi → ném lại cho caller', async () => {
    const provider = createProvider();
    sendMailMock.mockRejectedValue(new Error('Invalid login'));

    await expect(
      provider.sendMail({ to: 'user@example.com', subject: 'Hi' }),
    ).rejects.toThrow('Invalid login');
  });
});

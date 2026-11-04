import type { SendMailOptions } from './interfaces/mail-provider.interface';
import { MailService } from './mail.service';

describe('MailService', () => {
  let provider: { sendMail: jest.Mock };
  let service: MailService;
  let loggerError: jest.SpyInstance;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeEach(() => {
    provider = { sendMail: jest.fn().mockResolvedValue(undefined) };
    service = new MailService(provider);
    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontendUrl;
    }
  });

  it('sendMail chuyển tiếp nguyên options cho provider', async () => {
    const options: SendMailOptions = {
      to: 'user@example.com',
      subject: 'Hello',
      text: 'plain',
      html: '<p>html</p>',
    };

    await service.sendMail(options);

    expect(provider.sendMail).toHaveBeenCalledTimes(1);
    expect(provider.sendMail).toHaveBeenCalledWith(options);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('sendMail: provider lỗi → log message và ném lại đúng error', async () => {
    const error = new Error('SMTP down');
    provider.sendMail.mockRejectedValue(error);

    await expect(
      service.sendMail({ to: 'user@example.com', subject: 'Hello' }),
    ).rejects.toBe(error);

    expect(loggerError).toHaveBeenCalledWith('Failed to send email: SMTP down');
  });

  it('sendMail: lỗi không phải Error → vẫn ném lại, log message undefined', async () => {
    provider.sendMail.mockRejectedValue('boom');

    await expect(
      service.sendMail({ to: 'user@example.com', subject: 'Hello' }),
    ).rejects.toBe('boom');

    expect(loggerError).toHaveBeenCalledWith('Failed to send email: undefined');
  });

  it('sendVerificationEmail dựng URL từ FRONTEND_URL và token', async () => {
    process.env.FRONTEND_URL = 'https://movie.example.com';

    await service.sendVerificationEmail('user@example.com', 'token-123');

    expect(provider.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Xác thực tài khoản',
      html: expect.stringContaining(
        'https://movie.example.com/auth/verify-email?token=token-123',
      ),
    });
    expect(provider.sendMail.mock.calls[0][0].subject).toBe(
      'Xác thực tài khoản',
    );
    expect(provider.sendMail.mock.calls[0][0].html).toContain(
      'token=token-123',
    );
  });

  it('sendVerificationEmail dùng URL mặc định khi thiếu FRONTEND_URL', async () => {
    delete process.env.FRONTEND_URL;

    await service.sendVerificationEmail('user@example.com', 'abc');

    const html = provider.sendMail.mock.calls[0][0].html as string;
    expect(html).toContain('http://localhost:3002/auth/verify-email?token=abc');
  });

  it('sendVerificationEmail: provider lỗi → lỗi lan ra caller', async () => {
    provider.sendMail.mockRejectedValue(new Error('SMTP down'));

    await expect(
      service.sendVerificationEmail('user@example.com', 'token'),
    ).rejects.toThrow('SMTP down');
    expect(loggerError).toHaveBeenCalledWith('Failed to send email: SMTP down');
  });
});

import { Inject, Injectable } from '@nestjs/common';
import type {
  MailProvider,
  SendMailOptions,
} from './interfaces/mail-provider.interface';

@Injectable()
export class MailService {
  constructor(
    @Inject('MAIL_PROVIDER') private readonly mailProvider: MailProvider,
  ) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    await this.mailProvider.sendMail(options);
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    // URL này nên được cấu hình bằng biến môi trường (FRONTEND_URL) trong thực tế
    const verificationUrl = `http://localhost:8081/api/auth/verify-email?token=${token}`;
    await this.sendMail({
      to,
      subject: 'Xác nhận đăng ký tài khoản',
      html: `<p>Xin chào,</p><p>Vui lòng click vào link bên dưới để xác nhận tài khoản của bạn:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
    });
  }
}

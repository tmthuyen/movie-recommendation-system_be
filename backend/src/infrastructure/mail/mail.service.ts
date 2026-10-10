import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  MailProvider,
  SendMailOptions,
} from './interfaces/mail-provider.interface';

export const IMailService = Symbol('IMailService');
// interface
export interface IMailService {
  sendMail(options: SendMailOptions): Promise<void>;
  sendVerificationEmail(to: string, token: string): Promise<void>;
}
@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name);
  constructor(
    @Inject('MAIL_PROVIDER') private readonly mailProvider: MailProvider,
  ) {}

  async sendMail(options: SendMailOptions): Promise<void> {
    try {
      await this.mailProvider.sendMail(options);
    } catch (error: any) {
      this.logger.error(`Failed to send email: ${error.message}`);
      throw error;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
    const verificationUrl = `${frontendUrl}/auth/verify-email?token=${token}`;

    await this.sendMail({
      to,
      subject: 'Xác thực tài khoản',
      html: `<p>Xin chào,</p>
    <p>Vui lòng click vào link bên dưới để xác nhận tài khoản của bạn:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
    });
  }
}

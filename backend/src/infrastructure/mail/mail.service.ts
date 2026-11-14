import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  MailProvider,
  SendMailOptions,
} from './interfaces/mail-provider.interface';
import {
  createEmailVerifiedTemplate,
  createVerificationEmailTemplate,
} from './mail.templates';

export const IMailService = Symbol('IMailService');
// interface
export interface IMailService {
  sendMail(options: SendMailOptions): Promise<void>;
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendEmailVerified(to: string): Promise<void>;
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
    const { subject, html } = createVerificationEmailTemplate(token);
    await this.sendMail({
      to,
      subject,
      html,
    });
  }

  async sendEmailVerified(to: string): Promise<void> {
    const { subject, html } = createEmailVerifiedTemplate();
    await this.sendMail({
      to,
      subject,
      html,
    });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import {
  MailProvider,
  SendMailOptions,
} from '../interfaces/mail-provider.interface';

@Injectable()
export class NodemailerProvider implements MailProvider {
  private readonly logger = new Logger(NodemailerProvider.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const portEnv = this.configService.get<string>('MAIL_PORT', '587');
    const secureEnv = this.configService.get<string>('MAIL_SECURE', 'false');

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', '://gmail.com'),
      port: parseInt(portEnv, 10),
      secure: secureEnv === 'true',
      auth: {
        user: this.configService.get<string>('MAIL_USER', ''),
        pass: this.configService.get<string>('MAIL_PASS', ''),
      },
    });

    this.logger.log(
      `NodemailerProvider initialized with host: ${this.configService.get<string>(
        'MAIL_HOST',
      )}, port: ${this.configService.get<number>('MAIL_PORT')}, secure: ${this.configService.get<boolean>(
        'MAIL_SECURE',
      )}`,
    );
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM');
    await this.transporter.sendMail({
      from,
      ...options,
    });

    this.logger.log(
      `Email sent to ${options.to} with subject: ${options.subject}`,
    );
  }
}

import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import {
  MailProvider,
  SendMailOptions,
} from '../interfaces/mail-provider.interface';

@Injectable()
export class NodemailerProvider implements MailProvider {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('MAIL_PORT', 587),
      secure: this.configService.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.configService.get<string>('MAIL_USER', ''),
        pass: this.configService.get<string>('MAIL_PASS', ''),
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = this.configService.get<string>('MAIL_FROM');
    await this.transporter.sendMail({
      from,
      ...options,
    });
  }
}

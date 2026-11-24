import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  MailProvider,
  SendMailOptions,
} from '../interfaces/mail-provider.interface';

@Injectable()
export class SesProvider implements MailProvider {
  private readonly logger = new Logger(SesProvider.name);
  private readonly sesClient: SESClient;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>(
      'AWS_REGION',
      'ap-southeast-2',
    );
    this.fromEmail = this.configService.getOrThrow<string>('MAIL_FROM');

    const accessKeyId = this.configService.get<string>(
      'AWS_MAIL_ACCESS_KEY_ID',
    );
    const secretAccessKey = this.configService.get<string>(
      'AWS_MAIL_SECRET_ACCESS_KEY',
    );

    // Tự động lấy IAM Task Role nếu chạy trên ECS (không truyền accessKeyId/secretAccessKey)
    this.sesClient = new SESClient({
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.logger.log(`SesProvider initialized in region: ${region}`);
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [options.to],
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: 'UTF-8',
        },
        Body: {
          ...(options.html
            ? { Html: { Data: options.html, Charset: 'UTF-8' } }
            : {}),
          ...(options.text
            ? { Text: { Data: options.text, Charset: 'UTF-8' } }
            : {}),
        },
      },
    });

    const response = await this.sesClient.send(command);
    this.logger.log(
      `SES email sent to ${options.to} (MessageId: ${response.MessageId})`,
    );
  }
}

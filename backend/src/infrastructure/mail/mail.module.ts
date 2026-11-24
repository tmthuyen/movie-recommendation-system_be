import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IMailService, MailService } from './mail.service';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { SesProvider } from '@/infrastructure/mail/providers/ses.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    NodemailerProvider,
    SesProvider,
    {
      provide: 'MAIL_PROVIDER',
      inject: [ConfigService, NodemailerProvider, SesProvider],
      useFactory: (
        configService: ConfigService,
        nodemailerProvider: NodemailerProvider,
        sesProvider: SesProvider,
      ) => {
        const mailProvider = configService.get<string>('MAIL_PROVIDER', 'smtp');
        switch (mailProvider) {
          case 'smtp':
            return nodemailerProvider;
          case 'ses':
            return sesProvider;
          default:
            throw new Error(`Unsupported mail provider: ${mailProvider}`);
        }
      },
    },
    {
      provide: IMailService,
      useClass: MailService,
    },
  ],
  exports: [IMailService, 'MAIL_PROVIDER'],
})
export class MailModule {}

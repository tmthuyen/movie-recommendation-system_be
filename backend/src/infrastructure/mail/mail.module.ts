import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './mail.service';
import { NodemailerProvider } from './providers/nodemailer.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'MAIL_PROVIDER',
      useClass: NodemailerProvider,
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}

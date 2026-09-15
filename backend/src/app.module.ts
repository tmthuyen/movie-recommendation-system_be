import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { RolesModule } from '@/modules/roles/roles.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { AuditsModule } from '@common/audits/audits.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UsersModule } from '@/modules/users/users.module';
import { ClsModule } from 'nestjs-cls';
import { Role } from '@/modules/roles/entities/role.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Genre } from '@/modules/movies/entities/genre.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { Review } from '@/modules/reviews/entities/review.entity';
import { validateConfiguration } from '@/config/env.validation';
import { WinstonModule } from 'nest-winston';
import { loggerConfig } from '@/config/logger.config';
import { HealthModule } from './modules/health/health.module';
import { RedisModule } from './modules/redis/redis.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { MailModule } from './modules/mail/mail.module';
import { MessagingModule } from './modules/messaging/messaging.module';

@Module({
  imports: [
    // Configuration
    // https://docs.nestjs.com/techniques/configuration
    ConfigModule.forRoot({
      envFilePath: ['.env', '.env.development', '.env.production'],
      isGlobal: true,
      validate: validateConfiguration,
      // load: [configuration],
    }),
    // Database
    // https://docs.nestjs.com/techniques/database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type:
          config.get<string>('DB_TYPE') == 'postgres' ? 'postgres' : 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USERNAME'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        autoLoadEntities: true,
        entities: [Role, User, Genre, Movie, Rating, Review],
        synchronize: true,
        logging: config.get<string>('mode') === 'development',
      }),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    WinstonModule.forRoot(loggerConfig),

    // infra modules
    RedisModule,
    RateLimitModule,
    MailModule,
    MessagingModule,
    HealthModule,
    // Domain Modules
    AuditsModule,
    AuthModule,
    UsersModule,
    PermissionsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { WinstonModule } from 'nest-winston';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { RolesModule } from '@/modules/roles/roles.module';
import { PermissionsModule } from '@/modules/permissions/permissions.module';
import { AuditsModule } from '@common/audits/audits.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { UsersModule } from '@/modules/users/users.module';
import { Role } from '@/modules/roles/entities/role.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { HealthModule } from './modules/health/health.module';
import { validateConfiguration } from '@/config/env.validation';
import { loggerConfig } from '@/config/logger.config';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { CommentsModule } from './modules/comments/comments.module';
import { GenresModule } from './modules/genres/genres.module';
import { CountriesModule } from './modules/countries/countries.module';
import { PeoplesModule } from './modules/peoples/peoples.module';
import { MoviesModule } from './modules/movies/movies.module';
import { RatingsModule } from './modules/ratings/ratings.module';
import { Comment } from './modules/comments/entities/comment.entity';
import { People } from './modules/peoples/entities/people.entity';
import { Country } from './modules/countries/entities/country.entity';
import { MoviePeople } from './modules/movies/entities/movie-people.entity';
import { SeedRating } from './modules/ratings/entities/seed-rating.entity';
import { FilesModule } from './modules/files/files.module';
import { FailedEvent } from './modules/failed-events/entities/failed-event.entity';
import { FailedEventsModule } from './modules/failed-events/failed-events.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { EventsModule } from './modules/events/events.module';
import { Interaction } from './modules/interactions/entities/interaction.entity';
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
        entities: [
          Role,
          User,
          Movie,
          People,
          MoviePeople,
          Country,
          Genre,
          Rating,
          Comment,
          SeedRating,
          FailedEvent,
        ],
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
    CommentsModule,
    GenresModule,
    CountriesModule,
    PeoplesModule,
    MoviesModule,
    RatingsModule,
    FilesModule,
    FailedEventsModule,
    InteractionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

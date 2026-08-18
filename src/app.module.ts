import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { Product } from '@/products/product.entity';
import { ProductsModule } from '@/products/products.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditsModule } from './audits/audits.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ClsModule } from 'nestjs-cls';
import { Role } from '@/roles/entities/role.entity';
import { User } from '@/users/entities/user.entity';
import { validateConfiguration } from '@/config/env.validation';

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
        entities: [Product, Role, User],
        synchronize: true,
        logging: config.get<string>('mode') === 'development',
      }),
    }),
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    AuditsModule,
    ProductsModule,
    RolesModule,
    PermissionsModule,
    AuthModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

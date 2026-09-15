import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/modules/users/users.module';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';
// import { PassportModule } from '@nestjs/passport';

import { SessionService } from './session.service';
import { RolesModule } from '@/modules/roles/roles.module';

@Module({
  imports: [
    UsersModule,
    RolesModule,
    JwtModule.registerAsync({
      useFactory: (
        configService: ConfigService,
      ): Promise<JwtModuleOptions> | JwtModuleOptions => {
        const expiresIn = configService.get<string>(
          'ACCESS_EXPIRES_IN',
        ) as JwtSignOptions['expiresIn'];

        return {
          global: true,
          secret: configService.get<string>('ACCESS_SECRET_KEY'),
          signOptions: {
            expiresIn: expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SessionService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}

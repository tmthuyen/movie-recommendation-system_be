import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '@/users/users.module';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { JwtStrategy } from '@/auth/strategies/jwt.strategy';
import { ConfigService } from '@nestjs/config';
// import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      useFactory: (
        configService: ConfigService,
      ): Promise<JwtModuleOptions> | JwtModuleOptions => {
        const expiresIn = configService.get<string>(
          'JWT_EXPIRES_IN',
        ) as JwtSignOptions['expiresIn'];

        return {
          global: true,
          secret: configService.get<string>('JWT_SECRET_KEY'),
          signOptions: {
            expiresIn: expiresIn,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

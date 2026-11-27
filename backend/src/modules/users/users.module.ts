import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { RolesModule } from '@/modules/roles/roles.module';

import { IUserRepository, UserRepository } from './users.repository';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { StorageModule } from '@/infrastructure/storage/storage.module';
import { AuthModule } from '@/modules/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    RolesModule,
    StorageModule,
    // AuthModule imports UsersModule → cần forwardRef để inject SessionService.
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [
    {
      provide: IUserRepository,
      useClass: UserRepository,
    },
    UsersService,
    UserProducer,
  ],
  exports: [UsersService],
})
export class UsersModule {}

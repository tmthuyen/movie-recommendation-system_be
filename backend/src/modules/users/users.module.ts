import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { RolesModule } from '@/modules/roles/roles.module';

import { IUserRepository, UserRepository } from './users.repository';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RolesModule],
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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export const IUserRepository = Symbol('IUserRepository');

export interface IUserRepository {
  save(user: Partial<User>): Promise<User>;
  findByIdWithRoles(userId: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async save(user: Partial<User>): Promise<User> {
    return this.userRepo.save(user);
  }

  async findByIdWithRoles(userId: number): Promise<User | null> {
    return this.userRepo.findOne({
      where: { id: userId },
      relations: { roles: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email },
      relations: { roles: true },
    });
  }
}

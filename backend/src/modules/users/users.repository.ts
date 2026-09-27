import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export const IUserRepository = Symbol('IUserRepository');

export interface IUserRepository {
  save(user: Partial<User>): Promise<User>;
  findByIdWithRoles(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAndCount(options: {
    page: number;
    limit: number;
    keyword?: string;
  }): Promise<[User[], number]>;
}

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async save(user: Partial<User>): Promise<User> {
    return this.userRepo.save(user);
  }

  async findByIdWithRoles(userId: string): Promise<User | null> {
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

  async findAndCount(options: {
    page: number;
    limit: number;
    keyword?: string;
  }): Promise<[User[], number]> {
    const { page, limit, keyword } = options;
    const query = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles');

    if (keyword) {
      query.where('user.fullName ILIKE :keyword OR user.email ILIKE :keyword', {
        keyword: `%${keyword}%`,
      });
    }

    query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');

    return query.getManyAndCount();
  }
}

import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { SearchUtils } from '@/common/utils/search.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export const IUserRepository = Symbol('IUserRepository');

export interface IUserRepository {
  save(user: Partial<User>): Promise<User>;
  findByIdWithRoles(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  search(request: BaseSearchRequest): Promise<[User[], number]>;
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

  async search(request: BaseSearchRequest): Promise<[User[], number]> {
    const {
      page = 1,
      limit = 10,
      keyword,
      filters = [],
      sort = ['createdAt:DESC'],
    } = request;

    const qb = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role');

    // keyword search: fullName, email, phoneNumber
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere(
        '(user.fullName ILIKE :keyword OR user.email ILIKE :keyword OR user.phoneNumber ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'user.id',
      email: 'user.email',
      fullName: 'user.fullName',
      phoneNumber: 'user.phoneNumber',
      status: 'user.status',
      isVerified: 'user.isVerified',
      gender: 'user.gender',
      birthDate: 'user.birthDate',
      createdAt: 'user.createdAt',
      updatedAt: 'user.updatedAt',
      roleId: 'role.id',
      roleCode: 'role.code',
    };

    SearchUtils.applyFilters(qb, filters || [], fieldMap);

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortMap = {
      id: 'user.id',
      email: 'user.email',
      fullName: 'user.fullName',
      status: 'user.status',
      isVerified: 'user.isVerified',
      birthDate: 'user.birthDate',
      createdAt: 'user.createdAt',
      updatedAt: 'user.updatedAt',
    };

    const sortOptions = SearchUtils.parseSort(
      sort.join(','),
      Object.keys(sortMap),
    );

    for (const option of sortOptions) {
      const column = sortMap[option.field] as string | undefined;
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      qb.addOrderBy(column, option.direction);
    }

    // stable sort by id
    if (!sortOptions.some(option => option.field === 'id')) {
      qb.addOrderBy('user.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================

    // ====================
    // START PAGINATION
    // ====================
    const skip = (page - 1) * limit;

    qb.skip(skip).take(limit);

    return qb.getManyAndCount();
  }
}

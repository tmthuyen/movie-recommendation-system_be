import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserStatus } from './entities/user.entity';
import { RolesService } from '@/modules/roles/roles.service';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import * as bcrypt from 'bcrypt';
import { IUserRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    @Inject(IUserRepository) private readonly userRepo: IUserRepository,
    private readonly roleSv: RolesService,
  ) {}

  // =========
  // CRUD basic

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email đã tồn tại');
    }
    const r = await this.roleSv.findAllByIds(createUserDto.roleIds);
    const u = await this.userRepo.save({
      ...createUserDto,
      roles: r,
    });

    return u;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const [data, total] = await this.userRepo.findAndCount({
      page,
      limit,
      keyword,
    });
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const user = await this.userRepo.findByIdWithRoles(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.findOne(id);
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    Object.assign(user, updateUserDto);
    await this.userRepo.save(user);
    return user;
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    user.status = UserStatus.BLOCKED;
    await this.userRepo.save(user);
    return user;
  }

  async assignRoles(userId: number, roleIds: number[]) {
    const user = await this.findByIdWithRoles(userId);
    const roles = await this.roleSv.findAllByIds(roleIds);
    user.roles = roles;
    await this.userRepo.save(user);
    return user;
  }

  // End CRUD basic
  // ===============

  async findByIdWithRoles(userId: number): Promise<User> {
    const user = await this.userRepo.findByIdWithRoles(userId);
    if (!user) {
      throw new NotFoundException(`User with not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findByEmail(email);
  }
  async updateStatus(id: number, status: UserStatus) {
    await this.userRepo.save({ id, status });
  }

  async updatePassword(id: number, passwordHash: string) {
    await this.userRepo.save({ id, password: passwordHash });
  }
}

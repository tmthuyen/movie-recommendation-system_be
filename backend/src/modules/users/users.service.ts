import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserStatus } from '@/modules/users/entities/user.entity';
import { RolesService } from '@/modules/roles/roles.service';
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

  findAll() {
    return `This action returns all users`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto) {
    return `This action updates a #${id} user`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
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

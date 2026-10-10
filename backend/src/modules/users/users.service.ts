import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserStatus } from './entities/user.entity';
import { RolesService } from '@/modules/roles/roles.service';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import * as bcrypt from 'bcrypt';
import { IUserRepository } from './users.repository';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import {
  type IStorageService,
  STORAGE_SERVICE,
} from '@/infrastructure/storage/storage.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @Inject(IUserRepository) private readonly userRepo: IUserRepository,
    private readonly roleSv: RolesService,
    private readonly userProducer: UserProducer,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
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

    this.userProducer.publishUserCreated({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
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

  async findOne(id: string) {
    const user = await this.userRepo.findByIdWithRoles(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user: User = await this.findOne(id);
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    this.logger.log(`Updating user: ${user.id}`);
    this.logger.log(`Update data: ${JSON.stringify(updateUserDto)}`);
    Object.assign(user, updateUserDto);
    await this.userRepo.save(user);

    this.userProducer.publishUserUpdated({
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
    });

    return user;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    user.status = UserStatus.BLOCKED;
    await this.userRepo.save(user);

    this.userProducer.publishUserDeleted(user.id);

    return user;
  }

  async assignRoles(userId: string, roleIds: number[]) {
    const user = await this.findByIdWithRoles(userId);
    const roles = await this.roleSv.findAllByIds(roleIds);
    user.roles = roles;
    await this.userRepo.save(user);
    return user;
  }

  // End CRUD basic
  // ===============

  async findByIdWithRoles(userId: string): Promise<User> {
    const user = await this.userRepo.findByIdWithRoles(userId);
    if (!user) {
      throw new NotFoundException(`User with not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findByEmail(email);
  }
  async updateStatus(id: string, status: UserStatus, isVerified?: boolean) {
    if (!isVerified) {
      await this.userRepo.save({
        id,
        status,
      });
    } else {
      await this.userRepo.save({
        id,
        status,
        isVerified: isVerified,
      });
    }
  }

  async updatePassword(id: string, passwordHash: string) {
    await this.userRepo.save({ id, password: passwordHash });
  }

  // avatar
  async updateAvatar(id: string, file: Express.Multer.File, folder: string) {
    const user = await this.findOne(id);

    // xóa avatar cũ nếu có
    if (user.avatarUrl) {
      await this.storageService.deleteFile(user.avatarUrl);
      this.logger.log(
        `Deleted old avatar for user ${user.id}: ${user.avatarUrl}`,
      );
    }

    user.avatarUrl = await this.storageService.uploadFile(file, folder);
    await this.userRepo.save(user);
    this.logger.log(`Updated avatar for user ${user.id}: ${user.avatarUrl}`);
    return user.avatarUrl;
  }
}

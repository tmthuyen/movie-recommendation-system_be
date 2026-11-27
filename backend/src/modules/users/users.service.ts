import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SessionService } from '@/modules/auth/session.service';
import { User, UserStatus } from './entities/user.entity';
import { RolesService } from '@/modules/roles/roles.service';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { PaginationUtils } from '@/common/utils/search.util';
import * as bcrypt from 'bcrypt';
import { IUserRepository } from './users.repository';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import {
  type IStorageService,
  STORAGE_SERVICE,
} from '@/infrastructure/storage/storage.service';

/**
 * `preferenceData` là jsonb tuỳ ý. Giữ nguyên object gửi lên (có thể chứa
 * `{id,name}`), không lọc theo string như trước.
 */
function getPreferenceData(
  preferenceData: User['preferenceData'] | null | undefined,
): Record<string, string[]> {
  return (preferenceData ?? {}) as Record<string, string[]>;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @Inject(IUserRepository) private readonly userRepo: IUserRepository,
    private readonly roleSv: RolesService,
    private readonly userProducer: UserProducer,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
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

    await this.userProducer.publishUserCreated({
      userId: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      preferenceData: getPreferenceData(u.preferenceData),
    });

    return u;
  }

  async findAll(
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<User>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.userRepo.search({
      ...request,
      page,
      limit,
    });

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async findOne(id: string) {
    const user = await this.userRepo.findByIdWithRoles(id);
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng với ID ${id}`);
    }
    return user;
  }

  async update(
    id: string,
    updateUserDto: UpdateProfileDto | AdminUpdateUserDto,
    actorId?: string,
  ) {
    const user: User = await this.findOne(id);
    const payload = { ...updateUserDto } as Partial<User> & {
      password?: string;
    };

    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }
    if (payload.email && payload.email !== user.email) {
      const existing = await this.findByEmail(payload.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    const status = payload.status;
    if (status !== undefined && !Object.values(UserStatus).includes(status)) {
      throw new BadRequestException('Trạng thái tài khoản không hợp lệ');
    }
    if (
      actorId === id &&
      (status === UserStatus.BLOCKED || status === UserStatus.INACTIVE)
    ) {
      throw new BadRequestException(
        'Không thể tự khoá hoặc vô hiệu hoá tài khoản của chính mình',
      );
    }

    const previousStatus = user.status;
    const changedFields = Object.keys(payload);
    Object.assign(user, payload);
    await this.userRepo.save(user);

    // Chuyển sang BLOCKED/INACTIVE thì thu hồi session, blacklist jti accessToken.
    if (
      status !== undefined &&
      status !== previousStatus &&
      (status === UserStatus.BLOCKED || status === UserStatus.INACTIVE)
    ) {
      await this.sessionService.removeAllSessions(user.id);
    }

    await this.userProducer.publishUserUpdated({
      userId: user.id,
      preferenceData: getPreferenceData(user.preferenceData),
    });

    this.logger.log(
      `Cập nhật user: userId=${user.id}, fields=[${changedFields.join(',')}]`,
    );

    return user;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    user.status = UserStatus.BLOCKED;
    await this.userRepo.save(user);

    await this.userProducer.publishUserDeleted(user.id);

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
      throw new NotFoundException('Không tìm thấy người dùng');
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

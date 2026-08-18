import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/users/entities/user.entity';
import { RolesService } from '@/roles/roles.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly roleSv: RolesService,
  ) {}

  // =========
  // CRUD basic

  async create(createUserDto: CreateUserDto) {
    if (await this.findByEmail(createUserDto.email)) {
      throw new ConflictException('Email is existed');
    }
    const r = await this.roleSv.findAllByIds(createUserDto.role_ids);
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
    const user = await this.userRepo.findOne({
      where: {
        id: userId,
      },
      relations: {
        roles: true, // Include the roles relation
      },
    });
    if (!user) {
      throw new NotFoundException(`User with not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: {
        email,
      },
      relations: {
        roles: true, // Include the roles relation
      },
    });
    if (!user) {
      throw new NotFoundException(`User with not found`);
    }
    return user;
  }
}

import { CreateRoleDto } from '@/modules/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@/modules/roles/dto/update-role.dto';
import { Role } from '@/modules/roles/entities/role.entity';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(@InjectRepository(Role) private roleRepo: Repository<Role>) {}

  async create(createRoleDto: CreateRoleDto) {
    // check code
    if (await this.roleRepo.findOneBy({ code: createRoleDto.code })) {
      throw new ConflictException('Exist role code');
    }
    const role = this.roleRepo.create(createRoleDto);
    const saved = await this.roleRepo.save(role);
    this.logger.log(
      `Tạo role thành công: roleId=${saved.id}, code=${saved.code}`,
    );
    return saved;
  }

  async findAll() {
    return await this.roleRepo.find();
  }

  async findOne(id: number) {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async update(id: number, updateRoleDto: UpdateRoleDto) {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    if (updateRoleDto.code && role.code !== updateRoleDto.code) {
      if (await this.roleRepo.findOneBy({ code: updateRoleDto.code })) {
        throw new ConflictException('Exist code');
      }
    }

    Object.assign(role, updateRoleDto);
    const changedFields = Object.keys(updateRoleDto);
    const saved = await this.roleRepo.save(role);
    this.logger.log(
      `Cập nhật role: roleId=${id}, fields=[${changedFields.join(',')}]`,
    );
    return saved;
  }

  async remove(id: number) {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    const removed = await this.roleRepo.remove(role);
    this.logger.log(`Xoá role: roleId=${id}`);
    return removed;
  }

  async findAllByIds(ids: number[]): Promise<Role[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    return await this.roleRepo.findBy({
      id: In(ids),
    });
  }

  async findByCode(code: string): Promise<Role | null> {
    return await this.roleRepo.findOneBy({ code });
  }
}

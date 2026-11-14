import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { PaginationUtils, SearchUtils } from '@/common/utils/search.util';
import { CreateRoleDto } from '@/modules/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@/modules/roles/dto/update-role.dto';
import { Role } from '@/modules/roles/entities/role.entity';
import {
  BadRequestException,
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
    const code = createRoleDto.code.trim().toUpperCase();
    if (await this.roleRepo.findOneBy({ code: code })) {
      throw new ConflictException('Exist role code');
    }
    const role = this.roleRepo.create(createRoleDto);
    const saved = await this.roleRepo.save(role);
    this.logger.log(
      `Tạo role thành công: roleId=${saved.id}, code=${saved.code}`,
    );
    return saved;
  }

  async findAll(
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Role>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const { keyword, filters = [], sort = ['createdAt:DESC'] } = request;

    const qb = this.roleRepo.createQueryBuilder('role');

    // keyword search: title, titleVi
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere('(role.name ILIKE :keyword OR role.code ILIKE :keyword)', {
        keyword: `%${trimmedKeyword}%`,
      });
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'role.id',
      code: 'role.code',
    };

    SearchUtils.applyFilters(qb, filters || [], fieldMap);

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortMap = {
      id: 'role.id',
      code: 'role.code',
      name: 'role.name',
      createdAt: 'role.createdAt',
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
      qb.addOrderBy('role.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================

    // ====================
    // START PAGINATION
    // ====================
    const skip = (page - 1) * limit;

    qb.skip(skip).take(limit);

    // this.logger.log(`Executing search query: ${queryBuilder.getSql()}`);

    const [data, total] = await qb.getManyAndCount();

    const pagination = PaginationUtils.getPaginationMeta(page, limit, total);

    // ====================
    // END PAGINATION
    // ====================
    return {
      result: data,
      pagination,
    };
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

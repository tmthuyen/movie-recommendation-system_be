import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { RolesService } from './roles.service';
import { Role } from './entities/role.entity';

describe('RolesService', () => {
  let service: RolesService;
  let repo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findBy: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  const makeRole = (overrides: Partial<Role> = {}): Role =>
    ({
      id: 1,
      code: 'USER',
      name: 'User',
      description: 'Người dùng',
      ...overrides,
    }) as Role;

  beforeEach(() => {
    repo = {
      findOneBy: jest.fn(),
      create: jest.fn((dto: Partial<Role>) => ({ ...dto })),
      save: jest.fn((role: Partial<Role>) => role as Role),
      find: jest.fn(),
      findBy: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    service = new RolesService(repo as unknown as Repository<Role>);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('code đã tồn tại → ném ConflictException, không tạo role', async () => {
      repo.findOneBy.mockResolvedValue(makeRole({ code: 'ADMIN' }));

      await expect(
        service.create({ code: 'ADMIN', name: 'Admin' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('code chưa tồn tại → tạo và lưu role', async () => {
      repo.findOneBy.mockResolvedValue(null);
      repo.save.mockImplementation(
        (role: Partial<Role>) =>
          ({
            id: 7,
            ...role,
          }) as Role,
      );

      const created = await service.create({
        code: 'EDITOR',
        name: 'Editor',
        description: 'Biên tập',
      });

      expect(repo.findOneBy).toHaveBeenCalledWith({ code: 'EDITOR' });
      expect(repo.create).toHaveBeenCalledWith({
        code: 'EDITOR',
        name: 'Editor',
        description: 'Biên tập',
      });
      expect(created).toMatchObject({ id: 7, code: 'EDITOR' });
    });
  });

  describe('findAll / findOne', () => {
    const makeQueryBuilder = () => {
      const qb = {
        andWhere: jest.fn(),
        addOrderBy: jest.fn(),
        skip: jest.fn(),
        take: jest.fn(),
        getManyAndCount: jest.fn(),
      };
      qb.andWhere.mockReturnValue(qb);
      qb.addOrderBy.mockReturnValue(qb);
      qb.skip.mockReturnValue(qb);
      qb.take.mockReturnValue(qb);
      return qb;
    };

    it('findAll áp dụng keyword/filter/sort/pagination và trả {result, pagination}', async () => {
      const roles = [makeRole(), makeRole({ id: 2, code: 'ADMIN' })];
      const qb = makeQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([roles, 11]);
      repo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findAll({
        page: 2,
        limit: 5,
        keyword: ' adm ',
        filters: ['code:eq:ADMIN'],
        sort: ['name:ASC'],
      });

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('role');
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(role.name ILIKE :keyword OR role.code ILIKE :keyword)',
        { keyword: '%adm%' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('role.code = :filter_0', {
        filter_0: 'ADMIN',
      });
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(1, 'role.name', 'ASC');
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(2, 'role.id', 'ASC');
      expect(qb.skip).toHaveBeenCalledWith(5);
      expect(qb.take).toHaveBeenCalledWith(5);
      expect(result).toEqual({
        result: roles,
        pagination: { total: 11, page: 2, limit: 5, totalPages: 3 },
      });
    });

    it('findAll clamp page/limit và dùng sort mặc định createdAt:DESC', async () => {
      const qb = makeQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ page: 0, limit: 1000 });

      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.addOrderBy).toHaveBeenNthCalledWith(
        1,
        'role.createdAt',
        'DESC',
      );
    });

    it('findOne trả role khi tồn tại', async () => {
      const role = makeRole();
      repo.findOneBy.mockResolvedValue(role);

      await expect(service.findOne(1)).resolves.toBe(role);
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: 1 });
    });

    it('findOne ném NotFoundException khi role không tồn tại', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.findOne(5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(5)).rejects.toThrow(
        'Role with ID 5 not found',
      );
    });
  });

  describe('update', () => {
    it('role không tồn tại → NotFoundException, không lưu', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.update(5, { name: 'Mới' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('đổi sang code đã bị role khác dùng → ConflictException', async () => {
      repo.findOneBy
        .mockResolvedValueOnce(makeRole({ id: 1, code: 'USER' }))
        .mockResolvedValueOnce(makeRole({ id: 2, code: 'ADMIN' }));

      await expect(service.update(1, { code: 'ADMIN' })).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(repo.save).not.toHaveBeenCalled();
    });

    it('code mới chưa tồn tại → cập nhật thành công', async () => {
      repo.findOneBy
        .mockResolvedValueOnce(makeRole({ id: 1, code: 'USER' }))
        .mockResolvedValueOnce(null);

      const updated = await service.update(1, {
        code: 'STAFF',
        name: 'Nhân viên',
      });

      expect(updated).toMatchObject({
        id: 1,
        code: 'STAFF',
        name: 'Nhân viên',
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, code: 'STAFF' }),
      );
    });

    it('giữ nguyên code → không kiểm tra trùng, chỉ lưu thay đổi', async () => {
      repo.findOneBy.mockResolvedValueOnce(makeRole({ id: 1, code: 'USER' }));

      await service.update(1, { code: 'USER', name: 'Tên mới' });

      expect(repo.findOneBy).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, code: 'USER', name: 'Tên mới' }),
      );
    });
  });

  describe('remove', () => {
    it('role không tồn tại → ném NotFoundException', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.remove(9)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(9)).rejects.toThrow(
        'Role with ID 9 not found',
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('role tồn tại → xoá qua repository', async () => {
      const role = makeRole({ id: 9 });
      repo.findOneBy.mockResolvedValue(role);
      repo.remove.mockResolvedValue(role);

      await expect(service.remove(9)).resolves.toBe(role);
      expect(repo.remove).toHaveBeenCalledWith(role);
    });
  });

  describe('findAllByIds / findByCode', () => {
    it('ids rỗng → trả [] và không truy vấn DB', async () => {
      await expect(service.findAllByIds([])).resolves.toEqual([]);
      expect(repo.findBy).not.toHaveBeenCalled();
    });

    it('ids undefined → trả [] và không truy vấn DB', async () => {
      await expect(service.findAllByIds(undefined as never)).resolves.toEqual(
        [],
      );
      expect(repo.findBy).not.toHaveBeenCalled();
    });

    it('ids hợp lệ → truy vấn findBy với toán tử In', async () => {
      const roles = [makeRole({ id: 1 }), makeRole({ id: 2, code: 'ADMIN' })];
      repo.findBy.mockResolvedValue(roles);

      await expect(service.findAllByIds([1, 2])).resolves.toBe(roles);

      const where = repo.findBy.mock.calls[0][0] as {
        id: { _type: string; _value: number[] };
      };
      expect(where.id._type).toBe('in');
      expect(where.id._value).toEqual([1, 2]);
    });

    it('findByCode trả null khi không có role tương ứng', async () => {
      repo.findOneBy.mockResolvedValue(null);

      await expect(service.findByCode('NOPE')).resolves.toBeNull();
      expect(repo.findOneBy).toHaveBeenCalledWith({ code: 'NOPE' });
    });
  });
});

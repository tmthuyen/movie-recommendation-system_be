import { NotFoundException } from '@nestjs/common';

import { PeoplesService } from './peoples.service';
import { IPeopleRepository } from './peoples.repository';
import { People } from './entities/people.entity';

describe('PeoplesService', () => {
  let service: PeoplesService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const makePeople = (overrides: Partial<People> = {}): People =>
    ({
      id: 1,
      fullName: 'Nguyen Van A',
      nationality: 'Việt Nam',
      mainRole: 'actor',
      ...overrides,
    }) as People;

  beforeEach(() => {
    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    service = new PeoplesService(repo);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create / findAll', () => {
    it('create uỷ quyền cho repository', async () => {
      const created = makePeople({ id: 10 });
      repo.create.mockResolvedValue(created);

      await expect(service.create({ fullName: 'Nguyen Van A' })).resolves.toBe(
        created,
      );
      expect(repo.create).toHaveBeenCalledWith({ fullName: 'Nguyen Van A' });
    });

    it('findAll trả nguyên kết quả phân trang từ repository', async () => {
      const page = {
        data: [makePeople()],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      repo.findAll.mockResolvedValue(page);

      await expect(service.findAll({ page: 1, limit: 10 })).resolves.toBe(page);
      expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it('findAll với keyword vẫn uỷ quyền nguyên DTO xuống repository', async () => {
      repo.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 5,
        totalPages: 0,
      });

      await service.findAll({ page: 1, limit: 5, keyword: 'an' });

      expect(repo.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 5,
        keyword: 'an',
      });
    });
  });

  describe('findOne', () => {
    it('trả people khi tồn tại', async () => {
      const people = makePeople();
      repo.findById.mockResolvedValue(people);

      await expect(service.findOne(1)).resolves.toBe(people);
      expect(repo.findById).toHaveBeenCalledWith(1);
    });

    it('ném NotFoundException kèm id khi không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(42)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.findOne(42)).rejects.toThrow(
        'People with ID 42 not found',
      );
    });
  });

  describe('update', () => {
    it('kiểm tra tồn tại rồi cập nhật theo id', async () => {
      const people = makePeople({ id: 3 });
      repo.findById.mockResolvedValue(people);
      repo.update.mockResolvedValue({ ...people, fullName: 'Tên Mới' });

      await expect(
        service.update(3, { fullName: 'Tên Mới' }),
      ).resolves.toMatchObject({ id: 3, fullName: 'Tên Mới' });

      expect(repo.update).toHaveBeenCalledWith(3, { fullName: 'Tên Mới' });
    });

    it('không tồn tại → NotFoundException, không gọi update', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update(99, { fullName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('uỷ quyền id của people tìm được (không dùng id thô từ tham số)', async () => {
      // findOne trả entity đã chuẩn hoá id, update phải dùng people.id.
      const people = makePeople({ id: 3 });
      repo.findById.mockResolvedValue(people);
      repo.update.mockResolvedValue(people);

      await service.update(3, { mainRole: 'director' });

      expect(repo.update).toHaveBeenCalledWith(3, { mainRole: 'director' });
    });
  });

  describe('remove', () => {
    it('kiểm tra tồn tại rồi xoá, trả { success: true }', async () => {
      repo.findById.mockResolvedValue(makePeople({ id: 3 }));
      repo.remove.mockResolvedValue(true);

      await expect(service.remove(3)).resolves.toEqual({ success: true });
      expect(repo.remove).toHaveBeenCalledWith(3);
    });

    it('không tồn tại → NotFoundException, không xoá', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });
  });
});

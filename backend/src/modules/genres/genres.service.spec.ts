import { NotFoundException } from '@nestjs/common';
import { GenresService } from './genres.service';
import { IGenreRepository } from './genres.repository';
import { FakeCacheService } from '@/infrastructure/cache/testing/fake-cache.service';

describe('GenresService', () => {
  let service: GenresService;
  let repo: Record<string, jest.Mock>;
  let cache: FakeCacheService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    cache = new FakeCacheService();
    service = new GenresService(repo as unknown as IGenreRepository, cache);
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('create uỷ quyền cho repository', async () => {
    repo.create.mockResolvedValue({ id: 1, name: 'Hành động' });

    await expect(service.create({ name: 'Hành động' })).resolves.toEqual({
      id: 1,
      name: 'Hành động',
    });
    expect(repo.create).toHaveBeenCalledWith({ name: 'Hành động' });
  });

  it('findAll trả dữ liệu phân trang từ repository', async () => {
    const page = { data: [{ id: 1 }], page: 1, totalPages: 1 };
    repo.findAll.mockResolvedValue(page);

    await expect(service.findAll({ page: 1, limit: 10 })).resolves.toBe(page);
  });

  it('findOne ném NotFoundException khi không tồn tại', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.findOne(5)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update kiểm tra tồn tại rồi cập nhật theo id', async () => {
    repo.findById.mockResolvedValue({ id: 5 });
    repo.update.mockResolvedValue({ id: 5, name: 'Mới' });

    await expect(service.update(5, { name: 'Mới' })).resolves.toEqual({
      id: 5,
      name: 'Mới',
    });
    expect(repo.update).toHaveBeenCalledWith(5, { name: 'Mới' });
  });

  it('remove kiểm tra tồn tại rồi xoá', async () => {
    repo.findById.mockResolvedValue({ id: 5 });
    repo.remove.mockResolvedValue(undefined);

    await expect(service.remove(5)).resolves.toEqual({ success: true });
    expect(repo.remove).toHaveBeenCalledWith(5);
  });
});

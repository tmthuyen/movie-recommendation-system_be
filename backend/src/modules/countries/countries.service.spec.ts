import { ConflictException, NotFoundException } from '@nestjs/common';
import { CountriesService } from './countries.service';
import { ICountryRepository } from './countries.repository';
import { FakeCacheService } from '@/infrastructure/cache/testing/fake-cache.service';

describe('CountriesService', () => {
  let service: CountriesService;
  let repo: Record<string, jest.Mock>;
  let cache: FakeCacheService;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findByNameOrCode: jest.fn(),
    };

    cache = new FakeCacheService();
    service = new CountriesService(
      repo as unknown as ICountryRepository,
      cache,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('create trùng tên/mã → ConflictException', async () => {
    repo.findByNameOrCode.mockResolvedValue({ id: 1 });

    await expect(
      service.create({
        viName: 'Việt Nam',
        enName: 'Vietnam',
        code: 'VN',
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('create hợp lệ → tạo quốc gia', async () => {
    repo.findByNameOrCode.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: 3, code: 'VN' });

    await expect(
      service.create({
        viName: 'Việt Nam',
        enName: 'Vietnam',
        code: 'VN',
      } as never),
    ).resolves.toEqual({ id: 3, code: 'VN' });
  });

  it('findAll trả dữ liệu phân trang', async () => {
    const page = { data: [], page: 1 };
    repo.findAll.mockResolvedValue(page);

    await expect(service.findAll({ page: 1, limit: 10 })).resolves.toBe(page);
  });

  it('findOne ném NotFoundException khi không tồn tại', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update và remove dùng id đã kiểm tra tồn tại', async () => {
    repo.findById.mockResolvedValue({ id: 2 });
    repo.update.mockResolvedValue({ id: 2, code: 'US' });
    repo.remove.mockResolvedValue(true);

    await expect(service.update(2, { code: 'US' })).resolves.toEqual({
      id: 2,
      code: 'US',
    });
    await expect(service.remove(2)).resolves.toEqual({ success: true });
    expect(repo.update).toHaveBeenCalledWith(2, { code: 'US' });
    expect(repo.remove).toHaveBeenCalledWith(2);
  });

  it('remove trả success=false khi repository không xoá được', async () => {
    repo.remove.mockResolvedValue(false);

    await expect(service.remove(2)).resolves.toEqual({ success: false });
  });

  it('remove id <= 0 ném NotFoundException và không gọi repository', async () => {
    await expect(service.remove(0)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});

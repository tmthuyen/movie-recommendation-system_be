import { PermissionsService } from './permissions.service';

/**
 * `PermissionsService` hiện là skeleton do Nest CLI sinh ra (chưa có entity /
 * repository thật, chưa thao tác DB). Các test dưới đây khoá lại hành vi hiện
 * tại (hợp đồng tạm thời) để tránh thay đổi âm thầm và để lộ ra khi module
 * được implement thật.
 */
describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(() => {
    service = new PermissionsService();
  });

  it('create trả message cố định (chưa persist dữ liệu)', () => {
    const result = service.create({ name: 'movie:read' });

    expect(result).toBe('This action adds a new permission');
  });

  it('findAll trả message danh sách cố định', () => {
    expect(service.findAll()).toBe('This action returns all permissions');
  });

  it('findOne nội suy id vào message', () => {
    expect(service.findOne(7)).toBe('This action returns a #7 permission');
  });

  it('update nội suy id vào message và bỏ qua DTO', () => {
    expect(service.update(9, { name: 'x' })).toBe(
      'This action updates a #9 permission',
    );
  });

  it('remove nội suy id vào message', () => {
    expect(service.remove(11)).toBe('This action removes a #11 permission');
  });

  it('findOne/update/remove không ném lỗi với id bất kỳ (chưa có kiểm tra tồn tại)', () => {
    expect(() => service.findOne(0)).not.toThrow();
    expect(() => service.update(-1, {})).not.toThrow();
    expect(() => service.remove(Number.MAX_SAFE_INTEGER)).not.toThrow();
  });
});

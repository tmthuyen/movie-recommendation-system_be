import { DataSource, InsertEvent, UpdateEvent } from 'typeorm';
import { ClsService } from 'nestjs-cls';

import { AuditFieldsSubscriber } from './audits-field.subscriber';
import { BaseAuditEntity } from './baseaudit.entity';

describe('AuditFieldsSubscriber', () => {
  let dataSource: { subscribers: unknown[] };
  let cls: { get: jest.Mock };
  let subscriber: AuditFieldsSubscriber;

  const insertEvent = (entity: unknown) =>
    ({ entity }) as unknown as InsertEvent<BaseAuditEntity>;

  const updateEvent = (entity: unknown) =>
    ({ entity }) as unknown as UpdateEvent<BaseAuditEntity>;

  beforeEach(() => {
    dataSource = { subscribers: [] };
    cls = { get: jest.fn() };

    subscriber = new AuditFieldsSubscriber(
      dataSource as unknown as DataSource,
      cls as unknown as ClsService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('onModuleInit đăng ký subscriber vào dataSource để giữ DI scope', () => {
    subscriber.onModuleInit();

    expect(dataSource.subscribers).toContain(subscriber);
    expect(dataSource.subscribers).toHaveLength(1);
  });

  describe('beforeInsert', () => {
    it('có userId → gán cả createdBy và updatedBy', () => {
      cls.get.mockReturnValue('user-1');
      const entity = { createdBy: null, updatedBy: null };

      subscriber.beforeInsert(insertEvent(entity));

      expect(cls.get).toHaveBeenCalledWith('userId');
      expect(entity).toEqual({ createdBy: 'user-1', updatedBy: 'user-1' });
    });

    it('không có userId → giữ nguyên entity', () => {
      cls.get.mockReturnValue(undefined);
      const entity = { createdBy: null, updatedBy: null };

      subscriber.beforeInsert(insertEvent(entity));

      expect(entity).toEqual({ createdBy: null, updatedBy: null });
    });

    it('entity không có thuộc tính createdBy → không thêm field lạ', () => {
      cls.get.mockReturnValue('user-1');
      const entity: Record<string, unknown> = { name: 'Movie' };

      subscriber.beforeInsert(insertEvent(entity));

      expect(entity).toEqual({ name: 'Movie' });
      expect('createdBy' in entity).toBe(false);
    });
  });

  describe('beforeUpdate', () => {
    it('có userId và entity → chỉ gán updatedBy', () => {
      cls.get.mockReturnValue('user-2');
      const entity = { createdBy: 'user-1', updatedBy: null };

      subscriber.beforeUpdate(updateEvent(entity));

      expect(entity).toEqual({ createdBy: 'user-1', updatedBy: 'user-2' });
    });

    it('không có userId → không đổi updatedBy', () => {
      cls.get.mockReturnValue(null);
      const entity = { updatedBy: null };

      subscriber.beforeUpdate(updateEvent(entity));

      expect(entity.updatedBy).toBeNull();
    });

    it('event.entity = undefined (update bằng query builder) → không ném lỗi', () => {
      cls.get.mockReturnValue('user-2');

      expect(() =>
        subscriber.beforeUpdate(updateEvent(undefined)),
      ).not.toThrow();
    });

    it('entity không có thuộc tính updatedBy → không thêm field lạ', () => {
      cls.get.mockReturnValue('user-2');
      const entity: Record<string, unknown> = { name: 'Movie' };

      subscriber.beforeUpdate(updateEvent(entity));

      expect(entity).toEqual({ name: 'Movie' });
    });
  });
});

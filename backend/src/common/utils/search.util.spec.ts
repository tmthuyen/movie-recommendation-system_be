import 'reflect-metadata';

import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { AppException } from '@/common/custom-exception/app-exception';
import { SearchUtils } from '@/common/utils/search.util';

const makeQueryBuilder = () => {
  const andWhere = jest.fn();
  const qb = { andWhere } as unknown as SelectQueryBuilder<ObjectLiteral>;
  andWhere.mockReturnValue(qb);
  return { qb, andWhere };
};

const fieldMap: Record<string, string> = {
  status: 'user.status',
  createdAt: 'user.createdAt',
  fullName: 'user.fullName',
};

describe('SearchUtils', () => {
  describe('parseSort', () => {
    it('sort rỗng → mặc định createdAt:DESC', () => {
      expect(SearchUtils.parseSort('', ['createdAt'])).toEqual([
        { field: 'createdAt', direction: 'DESC' },
      ]);
    });

    it('parse nhiều field, không phân biệt hoa/thường', () => {
      expect(
        SearchUtils.parseSort('fullname:asc,createdAt:DESC', [
          'fullName',
          'createdAt',
        ]),
      ).toEqual([
        { field: 'fullName', direction: 'ASC' },
        { field: 'createdAt', direction: 'DESC' },
      ]);
    });

    it('thiếu direction → AppException INVALID_SORT', () => {
      expect(() => SearchUtils.parseSort('createdAt', ['createdAt'])).toThrow(
        AppException,
      );
    });

    it('field không nằm trong allowlist → AppException INVALID_SORT_FIELD', () => {
      try {
        SearchUtils.parseSort('password:ASC', ['createdAt']);
        fail('phải ném AppException');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).errorCode).toBe('INVALID_SORT_FIELD');
      }
    });

    it('direction lạ → AppException INVALID_SORT_DIRECTION', () => {
      try {
        SearchUtils.parseSort('createdAt:SIDEWAYS', ['createdAt']);
        fail('phải ném AppException');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).errorCode).toBe(
          'INVALID_SORT_DIRECTION',
        );
      }
    });
  });

  describe('parseFilter', () => {
    const operatorMap = {
      eq: 'eq',
      gte: 'gte',
      between: 'between',
      in: 'in',
      notin: 'notIn',
      isnull: 'isNull',
    };

    it('giữ nguyên value có dấu ":" (timestamp ISO)', () => {
      expect(
        SearchUtils.parseFilter(
          'createdAt:gte:2026-01-01T00:00:00Z',
          fieldMap,
          operatorMap,
        ),
      ).toEqual({
        field: 'createdAt',
        operator: 'gte',
        value: '2026-01-01T00:00:00Z',
      });
    });

    it('isnull không cần value', () => {
      expect(
        SearchUtils.parseFilter('fullName:isnull', fieldMap, operatorMap),
      ).toEqual({
        field: 'fullName',
        operator: 'isnull',
        value: '',
      });
    });

    it('thiếu value với operator cần value → AppException INVALID_FILTER', () => {
      expect(() =>
        SearchUtils.parseFilter('status:eq', fieldMap, operatorMap),
      ).toThrow(AppException);
    });

    it('field lạ → AppException INVALID_FILTER', () => {
      expect(() =>
        SearchUtils.parseFilter('password:eq:1', fieldMap, operatorMap),
      ).toThrow(AppException);
    });

    it('operator lạ → AppException INVALID_FILTER', () => {
      expect(() =>
        SearchUtils.parseFilter('status:regex:ACTIVE', fieldMap, operatorMap),
      ).toThrow(AppException);
    });

    it('between thiếu from/to → AppException INVALID_FILTER', () => {
      expect(() =>
        SearchUtils.parseFilter(
          'createdAt:between:2026',
          fieldMap,
          operatorMap,
        ),
      ).toThrow(AppException);
    });
  });

  describe('applyFilters', () => {
    it('filters rỗng → không gọi andWhere', () => {
      const { qb, andWhere } = makeQueryBuilder();

      SearchUtils.applyFilters(qb, [], fieldMap);

      expect(andWhere).not.toHaveBeenCalled();
    });

    it('eq / contains / between / isNull sinh SQL + param đúng', () => {
      const { qb, andWhere } = makeQueryBuilder();

      SearchUtils.applyFilters(
        qb,
        [
          'status:eq:ACTIVE',
          'fullName:contains:nguyen',
          'createdAt:between:2026-01-01_2026-12-31',
          'fullName:isnull',
        ],
        fieldMap,
      );

      expect(andWhere).toHaveBeenNthCalledWith(1, 'user.status = :filter_0', {
        filter_0: 'ACTIVE',
      });
      expect(andWhere).toHaveBeenNthCalledWith(
        2,
        'user.fullName ILIKE :filter_1',
        { filter_1: '%nguyen%' },
      );
      expect(andWhere).toHaveBeenNthCalledWith(
        3,
        'user.createdAt BETWEEN :filter_2_from AND :filter_2_to',
        { filter_2_from: '2026-01-01', filter_2_to: '2026-12-31' },
      );
      expect(andWhere).toHaveBeenNthCalledWith(4, 'user.fullName IS NULL');
    });

    it('in / notin tách value bằng dấu "," và trim', () => {
      const { qb, andWhere } = makeQueryBuilder();

      SearchUtils.applyFilters(
        qb,
        ['status:in:ACTIVE, BLOCKED', 'status:notin:INACTIVE'],
        fieldMap,
      );

      expect(andWhere).toHaveBeenNthCalledWith(
        1,
        'user.status IN (:...filter_0)',
        { filter_0: ['ACTIVE', 'BLOCKED'] },
      );
      expect(andWhere).toHaveBeenNthCalledWith(
        2,
        'user.status NOT IN (:...filter_1)',
        { filter_1: ['INACTIVE'] },
      );
    });

    it('in rỗng → AppException INVALID_FILTER', () => {
      const { qb } = makeQueryBuilder();

      expect(() =>
        SearchUtils.applyFilters(qb, ['status:in:, ,'], fieldMap),
      ).toThrow(AppException);
    });

    it('field không có trong fieldMap → AppException INVALID_FILTER', () => {
      const { qb } = makeQueryBuilder();

      expect(() =>
        SearchUtils.applyFilters(qb, ['unknown:eq:1'], fieldMap),
      ).toThrow(AppException);
    });
  });
});

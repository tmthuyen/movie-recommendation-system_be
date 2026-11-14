import { AppException } from '@/common/custom-exception/app-exception';
import {
  OPERATOR_MAP,
  SearchFilter,
  SortOption,
} from '@/common/dtos/base-search-query.dto';
import { HttpStatus } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export class PaginationUtils {
  static getPaginationMeta(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }
}

export class SearchUtils {
  static allowDirections = ['ASC', 'DESC'];

  /** Parse sort string thành mảng các option để dùng trong query builder
   * @param sort: string, ví dụ: "releaseDate:DESC,voteAverage:ASC"
   * @param allowedFields: mảng các field được phép sort, ví dụ: ['releaseDate', 'voteAverage']
   * @returns Array<{ field: string, direction: 'ASC' | 'DESC' }>
   * @throws AppException nếu sort không hợp lệ
   */
  static parseSort(sort: string, allowedFields: string[]): Array<SortOption> {
    if (!sort) return [{ field: 'createdAt', direction: 'DESC' }];

    // map allowFields
    // ánh xạ field
    const mapField = new Map<string, string>();
    for (const f of allowedFields) {
      mapField.set(f.toLowerCase(), f);
    }

    // trả về field và direction đúng quy định
    const sortOptions = sort.split(',').map(s => {
      const [field, direction] = s.split(':');

      if (!field || !direction) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Sort không hợp lệ',
          `Sort không hợp lệ: ${s}`,
          'INVALID_SORT',
        );
      }

      const mappedField = mapField.get(field.toLowerCase());
      if (!mappedField) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Field không hợp lệ',
          `Field không hợp lệ: ${field}`,
          'INVALID_SORT_FIELD',
        );
      }

      if (!SearchUtils.allowDirections.includes(direction.toUpperCase())) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Order direction không hợp lệ',
          `Order direction không hợp lệ: ${direction}`,
          'INVALID_SORT_DIRECTION',
        );
      }

      return { field: mappedField, direction: direction.toUpperCase() };
    });

    return sortOptions as Array<SortOption>;
  }

  /** Filters array to Filter objects: field:operator:value */
  static parseFilter(
    filter: string,
    fieldMap: Record<string, string>,
    operatorMap: Record<string, string>,
  ): SearchFilter {
    // Giữ nguyên phần value sau dấu ':' thứ 2 để hỗ trợ timestamp ISO
    // (ví dụ: createdAt:gte:2026-01-01T00:00:00Z).
    const [field, operator, ...valueParts] = filter.split(':');
    const value = valueParts.join(':');

    if (!field || !operator) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Filter không hợp lệ',
        `Filter không hợp lệ: ${field}:${operator}:${value}`,
        'INVALID_FILTER',
      );
    }
    if (!operatorMap[operator.toLowerCase()]) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Operator không hợp lệ',
        `Operator không hợp lệ: ${operator}`,
        'INVALID_FILTER',
      );
    }
    if (!fieldMap[field]) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Field không hợp lệ',
        `Field không hợp lệ: ${field}`,
        'INVALID_FILTER',
      );
    }

    // isnull/isnotnull không cần value.
    const mappedOperator = operatorMap[operator.toLowerCase()];
    const valueOptional =
      mappedOperator === 'isNull' || mappedOperator === 'isNotNull';
    if (!value && !valueOptional) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Value không hợp lệ',
        `Value không hợp lệ: ${value}`,
        'INVALID_FILTER',
      );
    }

    // year:between:2020_2023 => { field: 'year', operator: 'between', value: 2020_2023 }
    if (operator.toLowerCase() === 'between') {
      const [from, to] = value.split('_');
      if (!from || !to) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Filter không hợp lệ với between operator',
          `Filter không hợp lệ: ${filter}`,
          'INVALID_FILTER',
        );
      }
    }

    return { field, operator: operator, value };
  }

  static applyFilters<T>(
    qb: SelectQueryBuilder<T extends ObjectLiteral ? T : ObjectLiteral>,
    filters: string[],
    fieldMap: Record<string, string>,
  ): void {
    if (!filters || filters.length === 0) {
      return;
    }

    filters.forEach((filter, index) => {
      // filter: field:operator:value, ví dụ: releaseDate:gte:2020-01-01
      const filterParsed = this.parseFilter(filter, fieldMap, OPERATOR_MAP);

      const column = fieldMap[filterParsed.field];

      if (!column) {
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Column không hợp lệ',
          `Column không hợp lệ: ${filterParsed.field}`,
          'INVALID_FILTER',
        );
      }

      const param = `filter_${index}`;
      const listValues = filterParsed.value
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0);

      switch (OPERATOR_MAP[filterParsed.operator.toLowerCase()]) {
        case 'eq': {
          qb.andWhere(`UPPER(${column}) = :${param}`, {
            [param]: filterParsed.value.trim().toUpperCase(),
          });
          break;
        }

        case 'ne':
          qb.andWhere(`${column} != :${param}`, {
            [param]: filterParsed.value,
          });
          break;

        case 'gt':
          qb.andWhere(`${column} > :${param}`, {
            [param]: filterParsed.value,
          });
          break;

        case 'gte':
          qb.andWhere(`${column} >= :${param}`, {
            [param]: filterParsed.value,
          });
          break;

        case 'lt':
          qb.andWhere(`${column} < :${param}`, {
            [param]: filterParsed.value,
          });
          break;

        case 'lte':
          qb.andWhere(`${column} <= :${param}`, {
            [param]: filterParsed.value,
          });
          break;

        case 'between': {
          // đã validate rồi
          const [from, to] = filterParsed.value.split('_');

          qb.andWhere(`${column} BETWEEN :${param}_from AND :${param}_to`, {
            [`${param}_from`]: from,
            [`${param}_to`]: to,
          });
          break;
        }

        case 'in':
          if (listValues.length === 0) {
            throw new AppException(
              HttpStatus.BAD_REQUEST,
              'Filter không hợp lệ với operator in',
              `Filter không hợp lệ: ${filter}`,
              'INVALID_FILTER',
            );
          }
          qb.andWhere(`${column} IN (:...${param})`, {
            [param]: listValues,
          });
          break;

        case 'notIn':
          if (listValues.length === 0) {
            throw new AppException(
              HttpStatus.BAD_REQUEST,
              'Filter không hợp lệ với operator notin',
              `Filter không hợp lệ: ${filter}`,
              'INVALID_FILTER',
            );
          }
          qb.andWhere(`${column} NOT IN (:...${param})`, {
            [param]: listValues,
          });
          break;

        case 'contains':
          qb.andWhere(`${column} ILIKE :${param}`, {
            [param]: `%${filterParsed.value}%`,
          });
          break;

        case 'isNull':
          qb.andWhere(`${column} IS NULL`);
          break;

        case 'isNotNull':
          qb.andWhere(`${column} IS NOT NULL`);
          break;

        default:
          throw new AppException(
            HttpStatus.BAD_REQUEST,
            'Filter không hợp lệ với operator: ' + filterParsed.operator,
            `Filter không hợp lệ: ${filter}`,
            'INVALID_FILTER',
          );
      }
    });
  }
}

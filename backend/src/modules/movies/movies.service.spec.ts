import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MoviesService } from './movies.service';
import { IMovieRepository } from './movies.repository';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Movie } from './entities/movie.entity';
import { FakeCacheService } from '@/infrastructure/cache/testing/fake-cache.service';

describe('MoviesService', () => {
  let service: MoviesService;
  let cache: FakeCacheService;
  let repo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let queryBuilder: Record<string, jest.Mock>;
  let dataSource: {
    getRepository: jest.Mock;
    transaction: jest.Mock;
  };
  let manager: {
    update: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let movieProducer: Record<string, jest.Mock>;
  let eventsGateway: Record<string, jest.Mock>;
  let interactionProducer: { publishInteractionCreated: jest.Mock };
  let statsService: { getStats: jest.Mock };

  // `sort` là field bắt buộc trong MovieSearchRequestDto (có default ở controller),
  // nên test helper cast để chỉ truyền phần cần kiểm tra.
  const search = (query: Record<string, unknown>) =>
    service.search(query as never);

  beforeEach(() => {
    queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getSql: jest.fn().mockReturnValue('SELECT ...'),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 0]),
    };

    const repositoryStub = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      findOne: jest.fn(),
      count: jest.fn(),
    };

    manager = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, dto) => ({ id: 11, ...dto })),
      save: jest.fn((entity: unknown) => entity),
    };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(repositoryStub),
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    repo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    movieProducer = {
      publishMovieCreated: jest.fn(),
      publishMovieUpdated: jest.fn(),
      publishMovieDeleted: jest.fn(),
    };
    eventsGateway = {
      broadcastViewCount: jest.fn(),
      broadcastInteraction: jest.fn(),
    };
    interactionProducer = { publishInteractionCreated: jest.fn() };
    statsService = {
      getStats: jest.fn().mockResolvedValue({
        likeCount: 2,
        commentCount: 1,
        viewCount: 9,
      }),
    };

    cache = new FakeCacheService();

    service = new MoviesService(
      repo as unknown as IMovieRepository,
      dataSource as unknown as DataSource,
      movieProducer as unknown as MovieProducer,
      eventsGateway as unknown as EventsGateway,
      interactionProducer as unknown as InteractionProducer,
      statsService as unknown as MovieInteractionStatsService,
      cache,
    );

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findOne / findAll', () => {
    it('findOne ném NotFoundException khi phim không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findAll uỷ quyền cho repository', async () => {
      repo.findAll.mockResolvedValue({
        data: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
      });

      await service.findAll({ page: 1, limit: 10 });

      expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it('findOne đọc cache: gọi lại không query DB lần 2', async () => {
      repo.findById.mockResolvedValue({ id: 5, title: 'Phim A' });

      await service.findOne(5);
      await service.findOne(5);

      expect(repo.findById).toHaveBeenCalledTimes(1);
    });

    it('findAll trang > 3 thì không cache', async () => {
      repo.findAll.mockResolvedValue({
        data: [],
        page: 4,
        limit: 10,
        total: 40,
        totalPages: 4,
      });

      await service.findAll({ page: 4, limit: 10 });
      await service.findAll({ page: 4, limit: 10 });

      expect(repo.findAll).toHaveBeenCalledTimes(2);
      expect(cache.setCalls).toHaveLength(0);
    });
  });

  describe('invalidate cache', () => {
    it('update xoá detail + tăng version list/recommendation', async () => {
      repo.findById.mockResolvedValue({ id: 7, title: 'A' });
      repo.update.mockResolvedValue({ id: 7, title: 'B' });

      await service.update(7, { title: 'B' });

      expect(cache.delCalls).toContain('cache:movie:7');
      expect(await cache.getCounter('cache:movie:ver:list')).toBe(1);
      expect(await cache.getCounter('cache:recommendation:ver:similar:7')).toBe(
        1,
      );
    });
  });

  describe('search', () => {
    it('mặc định page=1, limit=10, sort releaseDate DESC + id ASC', async () => {
      queryBuilder.getManyAndCount.mockResolvedValue([[{ id: 1 }], 25]);

      const res = await search({});

      expect(queryBuilder.skip).toHaveBeenCalledWith(0);
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'movie.releaseDate',
        'DESC',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('movie.id', 'ASC');
      expect(res.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
      expect(res.result).toEqual([{ id: 1 }]);
    });

    it('tính skip đúng theo page/limit', async () => {
      await search({ page: 3, limit: 20 });

      expect(queryBuilder.skip).toHaveBeenCalledWith(40);
      expect(queryBuilder.take).toHaveBeenCalledWith(20);
    });

    it('keyword được đưa vào ILIKE với %...%', async () => {
      await search({ keyword: '  hành động  ' });

      const ilikeCall = queryBuilder.andWhere.mock.calls.find(call =>
        String(call[0]).includes('ILIKE'),
      );
      expect(ilikeCall).toBeDefined();
      expect(ilikeCall?.[1]).toEqual({ keyword: '%hành động%' });
    });

    it('keyword rỗng chỉ còn whitespace → không thêm điều kiện ILIKE', async () => {
      await search({ keyword: '   ' });

      expect(
        queryBuilder.andWhere.mock.calls.some(call =>
          String(call[0]).includes('ILIKE'),
        ),
      ).toBe(false);
    });

    it('genreIds và countryIds được filter bằng IN', async () => {
      await search({ genreIds: [1, 2], countryIds: [3] });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'genre.id IN (:...genreIds)',
        { genreIds: [1, 2] },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'country.id IN (:...countryIds)',
        { countryIds: [3] },
      );
    });

    it('releaseYearFrom/releaseYearTo lọc theo biên ngày', async () => {
      await search({ releaseYearFrom: 2000, releaseYearTo: 2010 });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'movie.releaseDate >= :startDate',
        { startDate: '2000-01-01' },
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'movie.releaseDate <= :endDate',
        { endDate: '2010-12-31' },
      );
    });

    it('sort hợp lệ nhiều field', async () => {
      await search({ sort: 'voteAverage:ASC,viewCount:DESC' });

      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'movie.voteAverage',
        'ASC',
      );
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
        'movie.viewCount',
        'DESC',
      );
    });

    it('sort sai format → BadRequestException', async () => {
      await expect(search({ sort: 'releaseDate' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sort field không nằm trong allowlist → BadRequestException', async () => {
      await expect(search({ sort: 'password:ASC' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sort direction sai → BadRequestException', async () => {
      await expect(search({ sort: 'releaseDate:UP' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('luôn loại phim thiếu title/overview/poster (điều kiện IS NOT NULL)', async () => {
      await search({});

      const clauses = queryBuilder.andWhere.mock.calls.map(c => String(c[0]));
      expect(clauses).toEqual(
        expect.arrayContaining([
          'movie.title IS NOT NULL',
          'movie.titleVi IS NOT NULL',
          'movie.releaseDate IS NOT NULL',
          'movie.overview IS NOT NULL',
          'movie.overviewVi IS NOT NULL',
          'movie.posterPath IS NOT NULL',
          'movie.backdropPath IS NOT NULL',
        ]),
      );
    });
  });

  describe('incrementViewCount', () => {
    it('guest: tăng viewCount, broadcast view, không tạo interaction/publish', async () => {
      repo.findById.mockResolvedValue({ id: 1, viewCount: 5 });

      const res = await service.incrementViewCount(1);

      expect(manager.update).toHaveBeenCalledWith(Movie, 1, { viewCount: 6 });
      expect(eventsGateway.broadcastViewCount).toHaveBeenCalledWith(1, 6);
      expect(eventsGateway.broadcastInteraction).not.toHaveBeenCalled();
      expect(
        interactionProducer.publishInteractionCreated,
      ).not.toHaveBeenCalled();
      expect(res).toEqual({ viewCount: 6, score: 0, interaction: 'none' });
    });

    it('user xem lần đầu: tạo click score=1, broadcast added, publish event score=null', async () => {
      repo.findById.mockResolvedValue({ id: 1, viewCount: 0 });
      manager.findOne.mockResolvedValue(null);

      const res = await service.incrementViewCount(1, 'user-1');

      expect(manager.create).toHaveBeenCalledWith(
        Interaction,
        expect.objectContaining({
          type: InteractionType.CLICK,
          score: 1,
          movie: { id: 1 },
          user: { id: 'user-1' },
        }),
      );
      expect(eventsGateway.broadcastInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'added', score: 1 }),
      );
      expect(
        interactionProducer.publishInteractionCreated,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          movieId: 1,
          action: InteractionType.CLICK,
          score: null,
          removed: false,
        }),
      );
      expect(res).toMatchObject({ score: 1, interaction: 'created' });
    });

    it('user xem lại: score tăng 1, broadcast updated, vẫn publish event score=null', async () => {
      repo.findById.mockResolvedValue({ id: 1, viewCount: 3 });
      manager.findOne.mockResolvedValue({ id: 88, score: 2 });

      const res = await service.incrementViewCount(1, 'user-1');

      expect(manager.update).toHaveBeenCalledWith(Interaction, 88, {
        score: 3,
      });
      expect(eventsGateway.broadcastInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updated', score: 3 }),
      );
      expect(
        interactionProducer.publishInteractionCreated,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          movieId: 1,
          action: InteractionType.CLICK,
          score: null,
          removed: false,
        }),
      );
      expect(res).toMatchObject({ score: 3, interaction: 'updated' });
    });

    it('score click bị chặn trần band 5', async () => {
      repo.findById.mockResolvedValue({ id: 1, viewCount: 9 });
      manager.findOne.mockResolvedValue({ id: 88, score: 5 });

      const res = await service.incrementViewCount(1, 'user-1');

      expect(manager.update).toHaveBeenCalledWith(Interaction, 88, {
        score: 5,
      });
      expect(res).toMatchObject({ score: 5 });
    });

    it('phim không tồn tại → NotFoundException, không broadcast', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.incrementViewCount(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(eventsGateway.broadcastViewCount).not.toHaveBeenCalled();
    });
  });

  describe('create / update / remove', () => {
    it('create publish movie.created kèm genres', async () => {
      repo.create.mockResolvedValue({ id: 9 });
      repo.findById.mockResolvedValue({
        id: 9,
        title: 'A',
        titleVi: 'A',
        overview: 'o',
        overviewVi: 'o',
        genres: [{ name: 'Hành động' }],
      });

      await service.create({ title: 'A' });

      expect(movieProducer.publishMovieCreated).toHaveBeenCalledWith(
        expect.objectContaining({ movieId: 9, genres: ['Hành động'] }),
      );
    });

    it('create với genreIds không tồn tại → BadRequestException', async () => {
      dataSource.getRepository.mockReturnValue({
        count: jest.fn().mockResolvedValue(1),
        findOne: jest.fn(),
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      });

      await expect(
        service.create({ genreIds: [1, 2] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('update không đổi field AI → không publish movie.updated', async () => {
      repo.findById.mockResolvedValue({ id: 5, title: 'A' });
      repo.update.mockResolvedValue({ id: 5 });

      await service.update(5, { budget: 100 });

      expect(movieProducer.publishMovieUpdated).not.toHaveBeenCalled();
    });

    it('update đổi title → publish movie.updated', async () => {
      repo.findById
        .mockResolvedValueOnce({ id: 5, title: 'A' })
        .mockResolvedValueOnce({
          id: 5,
          title: 'B',
          genres: [{ name: 'Kinh dị' }],
        });
      repo.update.mockResolvedValue({ id: 5 });

      await service.update(5, { title: 'B' });

      expect(movieProducer.publishMovieUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ movieId: 5, genres: ['Kinh dị'] }),
      );
    });

    it('remove xoá phim và publish movie.deleted', async () => {
      repo.findById.mockResolvedValue({ id: 7 });
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(7)).resolves.toEqual({ success: true });
      expect(movieProducer.publishMovieDeleted).toHaveBeenCalledWith({
        movieId: 7,
      });
    });
  });
});

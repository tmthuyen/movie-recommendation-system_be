import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IInteractionRepository } from './interactions.repository';
import { ISeedRatingRepository } from '../ratings/seed-ratings.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { InteractionCreatedPayload } from '@/infrastructure/messaging/event.types';
import {
  type IRedisLockService,
  REDIS_LOCK_SERVICE,
} from '@/infrastructure/redis/redis-lock.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import {
  type IStorageService,
  STORAGE_SERVICE,
} from '@/infrastructure/storage/storage.service';
import { Interaction } from '@/modules/interactions/entities/interaction.entity';
import * as crypto from 'crypto';

@Injectable()
export class InteractionCronService {
  private readonly logger = new Logger(InteractionCronService.name);
  private readonly checkpointKey = 'interaction:training:checkpoint';

  constructor(
    @Inject(IInteractionRepository)
    private readonly interactionRepo: IInteractionRepository,
    @Inject(ISeedRatingRepository)
    private readonly seedRepo: ISeedRatingRepository,
    private readonly interactionProducer: InteractionProducer,
    @Inject(REDIS_LOCK_SERVICE)
    private readonly redisLockService: IRedisLockService,
    private readonly redisService: RedisService,
    @Inject(STORAGE_SERVICE)
    private readonly storageService: IStorageService,
  ) {}

  @Cron('0 */180 * * * *')
  /**
   * Cron job để chạy định kỳ và gửi dữ liệu tương tác để train ALS model cho AI service
   * @description Luồng xử lý:
   * - Kiểm tra Redis lock đã có job đang chạy hay chưa, nếu có thì skip
   * - Lấy thông tin lần cuối chạy job (lastCreatedAt, lastId) từ DB hoặc cache
   * - Query các tương tác mới nhất từ DB dựa trên lastCreatedAt và lastId
   * - Upload các tương tác này lên storage xong thì gửi message qua queue để AI service nhận và xử lý training
   */
  async handleBatchTrainingUpload() {
    // Check lock
    const lockKey = 'interaction:training:lock';

    const callback = async () => {
      this.logger.log('Starting batch interaction fetch for AI training...');

      // lấy checkpoint mới nhất nếu có
      const checkpoint = await this.redisService.hgetall(this.checkpointKey);
      this.logger.log(
        `Fetched checkpoint from Redis: ${JSON.stringify(checkpoint)}`,
      );
      let lastCreatedAt: string | null = null;
      let lastId: number | null = null;

      if (checkpoint.lastCreatedAt && checkpoint.lastId) {
        try {
          lastCreatedAt = checkpoint.lastCreatedAt
            ? checkpoint.lastCreatedAt
            : null;
          lastId = checkpoint.lastId ? parseInt(checkpoint.lastId, 10) : null;
        } catch (error) {
          this.logger.error(
            'Failed to parse checkpoint from Redis, ignoring and starting fresh.',
            error,
          );
        }
      }

      try {
        // // 1. Process Seed Data First
        // await this.processSeedRatings();

        // Process Actual App Interactions
        await this.processAppInteractions(lastCreatedAt, lastId);

        // Publish Training Request
        const correlationId = crypto.randomUUID();
        await this.interactionProducer.publishTrainingRequest(
          {
            folder: 'interactions',
          },
          correlationId,
        );

        this.logger.log(
          `correlationId=${correlationId} - Đã gửi yêu cầu training cho AI service`,
        );
      } catch (error) {
        this.logger.error('Failed to run interaction batch cron job', error);
        throw error; // rethrow to ensure the lock is released
      }
    };

    await this.redisLockService.runWithLock(lockKey, 60, callback);
  }

  private async processSeedRatings() {
    this.logger.log('Starting to fetch and send Seed Ratings...');
    const chunkSize = 10000;
    let offset = 0;
    let processedCount = 0;
    let hasMore = true;
    const MAX_SEED_RATINGS = 10_000;

    while (hasMore && processedCount < MAX_SEED_RATINGS) {
      const seedRatings = await this.seedRepo.findBatch(chunkSize, offset);
      if (seedRatings.length === 0) {
        hasMore = false;
        break;
      }

      // Format seed ratings to match Interaction Event format
      const formattedBatch: InteractionCreatedPayload[] = seedRatings.map(
        sr => ({
          // Ensure userId is string to match App's UUID.
          // Seed users have integer IDs originally, but stored as varchar/string.
          userId: sr.userId.toString(),
          movieId: sr.movieId,
          // For seed ratings, action could be considered 'rate' or 'like' depending on your model.
          // Let's use 'rating' and pass the explicit score.
          action: 'rating',
          score: sr.score,
          removed: false,
          createdAt: sr.createdAt,
        }),
      );

      // Publish to RabbitMQ
      await this.interactionProducer.publishTrainingBatch(formattedBatch);

      processedCount += seedRatings.length;
      offset += chunkSize;

      this.logger.log(`Sent ${processedCount} Seed Ratings to Queue...`);
    }

    this.logger.log(`Completed sending ${processedCount} total Seed Ratings.`);
  }

  /**
   * @description Luồng xử lý chi tiết bao gồm:
   * - Lấy cả tương tác mới nhất dựa trên createdAt và id lần cuối đã gửi
   * - lastId được lưu trong DB hoặc cache
   * - gửi các tương tác mới nhất này lên storage R2/S3
   * - Sau đó gửi thông tin metadata qua queue để AI service xử lý
   * - AI service sẽ lấy folder ở R2/S3 và xử lý batch training
   * - AI service training thành công sẽ tự lưu model lên storage và thông báo cho các AI service khác cập nhật lại model mới
   * - Thông báo cập nhật model có thể là Redis pub/sub hoặc queue có thể broadcast cho nhiều instance
   *
   * @returns
   */
  private async processAppInteractions(
    lastCreatedAt: string | null,
    lastId: number | null,
  ) {
    this.logger.log('Starting to fetch and send App Interactions...');

    // Nếu là null thì lấy hết
    const limit = 10000;
    let hasMore = true;
    let lastProcessedCreatedAt = lastCreatedAt;
    let lastProcessedId = lastId;

    while (hasMore) {
      const { data: interactions, nextCursor } =
        await this.interactionRepo.findLatestByCreatedAtAndId(
          lastProcessedCreatedAt,
          lastProcessedId,
          limit,
        );

      if (interactions.length === 0 || !nextCursor) {
        this.logger.log('No more new interactions to process.');
        hasMore = false;
        return;
      }

      this.logger.log(
        `Fetched ${interactions.length} new interactions from DB for training.`,
      );

      // upload lên storage
      const firstId = interactions[0].id;
      await this.uploadInteractionsToStorage(
        interactions,
        firstId,
        nextCursor.lastId,
        'interactions',
      );

      // Update the last processed timestamps
      lastProcessedCreatedAt = nextCursor.lastCreatedAt;
      lastProcessedId = nextCursor.lastId;

      // save checkpoint lên redis
      const checkpoint: Record<string, string> = {
        lastCreatedAt: lastProcessedCreatedAt,
        lastId: String(lastProcessedId),
      };
      const checkpointTtlSeconds = 24 * 60 * 60; // 1 day

      await this.redisService.hset(
        this.checkpointKey,
        checkpoint,
        checkpointTtlSeconds,
      );

      this.logger.log(
        `Đã lưu checkpoint mới lên redis: ${JSON.stringify(checkpoint)}`,
      );
    }
  }

  private async uploadInteractionsToStorage(
    interactions: Interaction[],
    firstId: number,
    lastId: number,
    folder: string = 'interactions',
  ): Promise<string> {
    this.logger.log(
      `Creating buffer for batch interactions from id ${firstId} to ${lastId} to storage...`,
    );
    const buffer = this.createBatchBuffer(interactions);

    const fileName = `${folder}/interactions_${firstId}_${lastId}.jsonl`;

    // gửi lên storage
    this.logger.log(
      `Uploading batch interactions from id ${firstId} to ${lastId} to storage...`,
    );
    const url = await this.storageService.uploadBuffer(
      buffer,
      fileName,
      'application/jsonl',
    );

    this.logger.log(
      `Đã upload batch interactions từ id ${firstId} đến ${lastId} lên storage: ${url}`,
    );

    return url;
  }

  private createBatchBuffer(interactions: Interaction[]): Buffer {
    const content = interactions
      .map(item =>
        JSON.stringify({
          userId: item.user.id,
          movieId: item.movie.id,
          action: item.type.toLowerCase(),
          score: item.score,
          removed: false,
          createdAt: item.createdAt.toISOString(),
        }),
      )
      .join('\n');

    return Buffer.from(content + '\n', 'utf-8');
  }
}

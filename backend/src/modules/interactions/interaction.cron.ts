import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IInteractionRepository } from './interactions.repository';
import { ISeedRatingRepository } from '../ratings/seed-ratings.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';

@Injectable()
export class InteractionCronService {
  private readonly logger = new Logger(InteractionCronService.name);

  // A flag to prevent concurrent cron executions from overlapping if processing takes too long
  private isProcessing = false;

  constructor(
    @Inject(IInteractionRepository)
    private readonly repo: IInteractionRepository,
    @Inject(ISeedRatingRepository)
    private readonly seedRepo: ISeedRatingRepository,
    private readonly interactionProducer: InteractionProducer,
  ) {}

  // Run every 2 minutes for testing, you can change to a longer interval in production
  @Cron('0 */1440 * * * *')
  async handleBatchTrainingUpload() {
    if (this.isProcessing) {
      this.logger.warn(
        'Previous batch processing is still running. Skipping this cron tick.',
      );
      return;
    }

    this.isProcessing = true;
    this.logger.log('Starting batch interaction fetch for AI training...');
    try {
      // 1. Process Seed Data First
      await this.processSeedRatings();

      // 2. Process Actual App Interactions
      await this.processAppInteractions();

      this.logger.log(
        `Finished sending all interactions (Seed + App) for AI training.`,
      );
    } catch (error) {
      this.logger.error('Failed to run interaction batch cron job', error);
    } finally {
      this.isProcessing = false;
    }
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
      const formattedBatch = seedRatings.map(sr => ({
        // Ensure userId is string to match App's UUID.
        // Seed users have integer IDs originally, but stored as varchar/string.
        userId: sr.userId.toString(),
        movieId: sr.movieId,
        // For seed ratings, action could be considered 'rate' or 'like' depending on your model.
        // Let's use 'rate' and pass the explicit score.
        action: 'rate',
        rating: sr.score,
        createdAt: sr.createdAt,
      }));

      // Publish to RabbitMQ
      this.interactionProducer.publishTrainingBatch(formattedBatch);

      processedCount += seedRatings.length;
      offset += chunkSize;

      this.logger.log(`Sent ${processedCount} Seed Ratings to Queue...`);
    }

    this.logger.log(`Completed sending ${processedCount} total Seed Ratings.`);
  }

  private async processAppInteractions() {
    this.logger.log('Starting to fetch and send App Interactions...');

    // In a real scenario, you might fetch interactions since the last sync time.
    // For now, we'll fetch a batch. Assuming repo has a method or we just fetch max.
    const paginationDto = { page: 1, limit: 50000 };
    const result = await this.repo.findAll(paginationDto);
    const interactions = result.data;

    if (interactions.length === 0) {
      this.logger.log('No app interactions found to send.');
      return;
    }

    this.logger.log(
      `Found ${interactions.length} app interactions. Formatting and sending to queue...`,
    );

    // Format data for AI Service
    const formattedInteractions = interactions.map(i => ({
      userId: i.user?.id,
      movieId: i.movie?.id,
      action: i.type?.toLowerCase(),
      rating: i.score,
      createdAt: i.createdAt,
    }));

    // Split into chunks if too large.
    const chunkSize = 10000;
    for (let i = 0; i < formattedInteractions.length; i += chunkSize) {
      const chunk = formattedInteractions.slice(i, i + chunkSize);
      this.interactionProducer.publishTrainingBatch(chunk);
    }

    this.logger.log(
      `Completed sending ${interactions.length} App Interactions.`,
    );
  }
}

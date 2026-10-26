import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { CommentsService } from './comments.service';
import { ICommentRepository } from './comments.repository';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: ICommentRepository, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: EventsGateway, useValue: {} },
        { provide: InteractionProducer, useValue: {} },
        { provide: MovieInteractionStatsService, useValue: {} },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

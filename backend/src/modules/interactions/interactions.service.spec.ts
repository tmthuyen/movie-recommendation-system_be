import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsService } from './interactions.service';
import { IInteractionRepository } from './interactions.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { EventsGateway } from '@/modules/events/events.gateway';
import { MovieInteractionStatsService } from './movie-interaction-stats.service';

describe('InteractionsService', () => {
  let service: InteractionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionsService,
        { provide: IInteractionRepository, useValue: {} },
        { provide: InteractionProducer, useValue: {} },
        { provide: EventsGateway, useValue: {} },
        { provide: MovieInteractionStatsService, useValue: {} },
      ],
    }).compile();

    service = module.get<InteractionsService>(InteractionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

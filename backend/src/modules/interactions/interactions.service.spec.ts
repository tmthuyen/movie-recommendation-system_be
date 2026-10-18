import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsService } from './interactions.service';
import { IInteractionRepository } from './interactions.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';

describe('InteractionsService', () => {
  let service: InteractionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionsService,
        { provide: IInteractionRepository, useValue: {} },
        { provide: InteractionProducer, useValue: {} },
      ],
    }).compile();

    service = module.get<InteractionsService>(InteractionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

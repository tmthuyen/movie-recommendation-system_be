import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { RatingsService } from './ratings.service';
import { IRatingRepository } from './ratings.repository';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';

describe('RatingsService', () => {
  let service: RatingsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: IRatingRepository, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: EventsGateway, useValue: {} },
        { provide: InteractionProducer, useValue: {} },
      ],
    }).compile();

    service = module.get<RatingsService>(RatingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

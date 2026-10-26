import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { MoviesService } from './movies.service';
import { IMovieRepository } from './movies.repository';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';

describe('MoviesService', () => {
  let service: MoviesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoviesService,
        { provide: IMovieRepository, useValue: {} },
        { provide: MovieProducer, useValue: {} },
        { provide: DataSource, useValue: {} },
        { provide: EventsGateway, useValue: {} },
        { provide: InteractionProducer, useValue: {} },
        { provide: MovieInteractionStatsService, useValue: {} },
      ],
    }).compile();

    service = module.get<MoviesService>(MoviesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

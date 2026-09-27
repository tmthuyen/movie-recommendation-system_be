import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeoplesService } from './peoples.service';
import { PeoplesController } from './peoples.controller';
import { People } from './entities/people.entity';
import { PeopleRepository, IPeopleRepository } from './peoples.repository';

@Module({
  imports: [TypeOrmModule.forFeature([People])],
  controllers: [PeoplesController],
  providers: [
    {
      provide: IPeopleRepository,
      useClass: PeopleRepository,
    },
    PeoplesService,
  ],
  exports: [PeoplesService],
})
export class PeoplesModule {}

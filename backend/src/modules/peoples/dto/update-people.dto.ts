import { PartialType } from '@nestjs/swagger';
import { CreatePeopleDto } from './create-people.dto';

export class UpdatePeopleDto extends PartialType(CreatePeopleDto) {}

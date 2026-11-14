import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({
    description: 'Danh sách ID của các role',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  roleIds: number[];
}

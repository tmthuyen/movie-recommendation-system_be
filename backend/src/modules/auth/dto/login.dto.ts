import { IsNotEmpty, IsString } from 'class-validator';

export class LoginRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Required' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  // remember_me: string;
}

export class LoginResponseDto {
  accessToken: string;
}

import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsNotEmpty()
  @IsString()
  oldPassword!: string;

  @IsNotEmpty({ message: 'Mật khẩu mới không được để trống' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu mới phải có ít nhất 6 ký tự' })
  newPassword!: string;

  @IsNotEmpty({ message: 'Mật khẩu xác nhận không được để trống' })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu xác nhận phải có ít nhất 6 ký tự' })
  confirmPassword!: string;
}

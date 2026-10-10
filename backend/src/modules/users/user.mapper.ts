import { UserWithRole } from '@/modules/users/dto/user-with-roles.dto';
import { User } from '@/modules/users/entities/user.entity';

export class UserMapper {
  static toUserWithRole(user: User): UserWithRole {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles.map((role: any) => role.name),
    };
  }

  static toResponse(user: User): any {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static toResponseList(users: User[]): any[] {
    return users.map(user => this.toResponse(user));
  }
}

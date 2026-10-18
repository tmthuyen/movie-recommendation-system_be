import { UserWithRole } from '@/modules/users/dto/user-with-roles.dto';
import { User } from '@/modules/users/entities/user.entity';
import { Role } from '@/modules/roles/entities/role.entity';

export class UserMapper {
  static toUserWithRole(user: User): UserWithRole {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles.map((role: Role) => role.name),
    };
  }

  static toResponse(user: User): Omit<User, 'password'> {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  static toResponseList(users: User[]): Omit<User, 'password'>[] {
    return users.map(user => this.toResponse(user));
  }
}

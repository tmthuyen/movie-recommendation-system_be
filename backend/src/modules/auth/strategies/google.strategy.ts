import { AppException } from '@/common/custom-exception/app-exception';
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    const googleId = profile.id;
    const fullName = profile.displayName;
    const avatar = profile.photos?.[0]?.value;

    if (!email) {
      throw new AppException(
        400,
        'Google profile does not contain an email',
        'Google profile does not contain an email',
        'GOOGLE_PROFILE_NO_EMAIL',
      );
    }

    return {
      googleId,
      email,
      fullName,
      avatar,
    };
  }
}

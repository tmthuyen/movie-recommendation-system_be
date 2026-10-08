export interface JwtPayload {
  sub: string;
  email: string;
  fullName: string;
  scopes: string[];
  sessionId: string;
  jti: string;
}

export interface DeviceInfoDto {
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  deviceName?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'other';
  os?: string;
  browser?: string;
}

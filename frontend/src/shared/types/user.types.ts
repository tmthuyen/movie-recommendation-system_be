export type ProfileDTO = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  target_band: number | null;
  vip_plan: string | null;
  vip_expired_at: string | null;
  created_at: string;
  updated_at: string;
  role_codes: string[];
};

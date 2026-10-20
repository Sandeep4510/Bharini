export type UserRole = 'artist' | 'production_house' | 'admin';

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_verified: boolean;
  email_verified_at?: string | null;
  date_joined: string;
};

export type TokenPair = {
  access: string;
  refresh: string;
};

export type ApiEnvelope<T> = {
  code?: string;
  message: string;
  request_id?: string;
  data?: T;
  field_errors?: Record<string, unknown>;
};

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
  onboarding_complete?: boolean;
  completion_percent?: number | null;
};

export type Discipline = 'actor' | 'singer' | 'choreographer' | 'musician' | 'director';
export type Gender = 'male' | 'female' | 'non_binary';
export type LanguageLevel = 'native' | 'fluent' | 'conversational' | 'basic';
export type PhotoSlot = 'center' | 'left' | 'right' | 'full_length';

export type ProfileLanguage = { language: string; level: LanguageLevel };

export type MediaSlot = {
  key: string;
  label: string;
  kind: 'video' | 'audio';
  max_seconds: number;
  max_mb: number;
  file: { url: string; duration_seconds: number } | null;
};

export type DisciplineMedia = { discipline: Discipline; label: string; slots: MediaSlot[] };

export type ProfileDocument = {
  id: number;
  kind: 'certificate' | 'achievement';
  title: string;
  file: string;
  uploaded_at: string;
};

export type ArtistProfile = {
  username: string | null;
  disciplines: Discipline[];
  profile_photo: string | null;
  bio: string;
  gender: Gender | '';
  date_of_birth: string | null;
  height_cm: number | null;
  location: string;
  phone: string;
  alt_email: string;
  alt_email_verified: boolean;
  instagram_url: string;
  facebook_url: string;
  showreel_links: string[];
  languages: ProfileLanguage[];
  documents: ProfileDocument[];
  photos: Record<PhotoSlot, string | null>;
  media_slots: DisciplineMedia[];
  missing_fields: string[];
  onboarding_complete: boolean;
  completion_percent: number;
};

export type Option = { value: string; label: string };

export type ProfileOptions = {
  disciplines: Option[];
  genders: Option[];
  languages: Option[];
  language_levels: Option[];
  document_kinds: Option[];
};

export type UsernameCheck = { username: string; available: boolean; suggestions: string[] };

export type Post = {
  id: number;
  author_name: string;
  body: string;
  media: string | null;
  media_kind: 'image' | 'video' | '';
  created_at: string;
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

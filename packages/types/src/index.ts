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

export type Discipline = 'actor' | 'singer' | 'choreographer' | 'musician' | 'director' | 'cinematographer';
export type Gender = 'male' | 'female' | 'non_binary';
export type LanguageLevel = 'native' | 'fluent' | 'conversational' | 'basic';
export type PhotoSlot = 'center' | 'left' | 'right' | 'full_length';

export type ProfileLanguage = { language: string; level: LanguageLevel };

export type MediaSlot = {
  key: string;
  label: string;
  kind: 'video' | 'audio' | 'image';
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

export type ArtistDirectoryProfile = {
  id: number;
  username: string | null;
  display_name: string;
  profile_photo: string | null;
  disciplines: string[];
  location: string;
};

export type ArtistDirectoryFilters = {
  age_min?: number;
  age_max?: number;
  gender?: string;
  discipline?: string;
  language?: string;
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

export type UserSummary = {
  id: number;
  name: string;
  role: UserRole;
  username: string | null;
  profile_photo: string | null;
};

export type ArtistPost = {
  id: number;
  author: UserSummary;
  body: string;
  media: string | null;
  media_kind: 'image' | 'video' | '';
  created_at: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  is_mine: boolean;
};

export type ArtistPostComment = {
  id: number;
  author: UserSummary;
  body: string;
  created_at: string;
  can_delete: boolean;
};

export type PublicProfile = UserSummary & {
  bio: string;
  location: string;
  disciplines: string[];
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_me: boolean;
  posts: ArtistPost[];
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

export type ProductionKind = 'individual' | 'house';

export type ProductionSummary = {
  id: number;
  name: string;
  kind: ProductionKind;
  profile_picture: string | null;
};

export type TitleCredit = {
  id: number;
  name: string;
  kind: 'movie' | 'serial';
  release_year: number | null;
  poster: string | null;
  role: 'made' | 'part_of';
};

export type Production = ProductionSummary & {
  title_credits: TitleCredit[];
  is_owner: boolean;
  created_at: string;
};

export type CastingCallDetails = {
  age_min: number;
  age_max: number;
  gender: 'any' | 'male' | 'female' | 'other';
  complexion: 'any' | 'fair' | 'wheatish' | 'medium' | 'dusky' | 'dark';
  languages: string;
  location: string;
  approx_pay: string;
};

export type Post = {
  id: number;
  post_type: 'update' | 'casting_call';
  body: string;
  image: string | null;
  hashtags: string[];
  share_count: number;
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  casting: CastingCallDetails | null;
  production: ProductionSummary;
  created_at: string;
};

export type PostComment = {
  id: number;
  body: string;
  author_name: string;
  created_at: string;
};

export type CursorPage<T> = {
  next: string | null;
  previous: string | null;
  results: T[];
};

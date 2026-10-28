import type { AuthUser, UserSummary } from '@bharini/types';

/** Where a freshly signed-in user lands: artists finish their profile first. */
export function landingPathFor(user: AuthUser) {
  if (user.role_confirmed === false) return '/auth/choose-role';  // new Google account: pick a role first
  return user.role === 'artist' && !user.onboarding_complete ? '/onboarding' : '/home';
}

/** A post or comment author's profile: production houses have their own page. */
export function profileHref(user: UserSummary) {
  return user.production_id ? `/productions/${user.production_id}` : `/u/${user.id}`;
}

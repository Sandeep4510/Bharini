import type { AuthUser } from '@bharini/types';

/** Where a freshly signed-in user lands: artists finish their profile first. */
export function landingPathFor(user: AuthUser) {
  return user.role === 'artist' && !user.onboarding_complete ? '/onboarding' : '/home';
}

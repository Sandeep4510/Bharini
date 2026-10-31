import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/** The app opens at "/": send people to Home or Login depending on whether they are signed in. */
export default function Index() {
  const { user } = useAuth();
  return <Redirect href={user ? '/home' : '/login'} />;
}

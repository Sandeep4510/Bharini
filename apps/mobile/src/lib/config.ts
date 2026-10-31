import { File } from 'expo-file-system';

/** The website, for links people share outside the app and for pages not built natively yet. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://10.0.2.2:3000';

/**
 * A picked or captured file (photo, video, audio, PDF) as a FormData file. Expo's fetch (the global fetch on Android
 * and iOS) accepts an expo-file-system File, not React Native's old `{ uri, name, type }` object. That File behaves
 * like the web File the shared api-client is typed for.
 */
export function toUpload(source: { uri: string }): globalThis.File {
  const file = new File(source.uri);
  if (!file.exists) throw new Error('Could not read the selected file. Try picking it again.');
  return file as unknown as globalThis.File;
}

/** Same rule as the web: years completed, counting the birthday this year. */
export function ageFrom(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  const hadBirthday = today.getMonth() > born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());
  return today.getFullYear() - born.getFullYear() - (hadBirthday ? 0 : 1);
}

/** DRF field errors ({ field: [message] }) flattened to one message per field, like the web's fieldErrorsFrom. */
export function fieldErrors(error: unknown): Record<string, string> {
  const raw = (error as { fieldErrors?: Record<string, unknown> } | null)?.fieldErrors ?? {};
  return Object.fromEntries(
    Object.entries(raw).map(([field, value]) => [field, Array.isArray(value) ? String(value.flat(3)[0] ?? '') : String(value ?? '')]),
  );
}

export function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

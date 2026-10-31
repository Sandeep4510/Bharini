import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile, ProfileOptions } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { ChipGroup, DateField, FormField, SelectField, SmallButton, TextField } from '@/components/form';
import { Button, ErrorBanner } from '@/components/ui';
import { openCamera } from '@/lib/camera';
import { ageFrom, fieldErrors, messageOf, toUpload } from '@/lib/config';

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

type Props = { profile: ArtistProfile; options: ProfileOptions; onProfile: (profile: ArtistProfile) => void; onNext: () => void };

/** Step 1, same fields and checks as the web's AboutStep, saved with one PATCH /profile/. */
export function AboutStep({ profile, options, onProfile, onNext }: Props) {
  const [username, setUsername] = useState(profile.username ?? '');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>(profile.disciplines);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [bio, setBio] = useState(profile.bio);
  const [gender, setGender] = useState<string>(profile.gender);
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? '');
  const [heightCm, setHeightCm] = useState(profile.height_cm ? String(profile.height_cm) : '');
  const [guardianName, setGuardianName] = useState(profile.guardian_name);
  const [guardianConsent, setGuardianConsent] = useState(Boolean(profile.guardian_consent_at));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isActor = disciplines.includes('actor');
  const age = ageFrom(dateOfBirth || null);
  const isMinor = age !== null && age < 18; // DPDP Act 2023: under 18 needs a parent or guardian's consent
  const height = Number(heightCm) || 0;

  const checkUsername = async () => {
    setSuggestions([]);
    if (!username || !USERNAME_PATTERN.test(username) || username === profile.username) return;
    try {
      const result = (await apiClient.checkUsername(username)).data;
      if (result && !result.available) {
        setErrors((previous) => ({ ...previous, username: `@${username} is taken. Try one of these:` }));
        setSuggestions(result.suggestions);
      }
    } catch {
      // the server checks again on save
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const validate = () => {
    const clientErrors: Record<string, string> = {};
    if (!username) clientErrors.username = 'Choose a username.';
    else if (!USERNAME_PATTERN.test(username)) clientErrors.username = 'Use 3-30 lowercase letters, numbers, dots or underscores.';
    if (!disciplines.length) clientErrors.disciplines = 'Pick at least one.';
    if (!photoUri && !profile.profile_photo) clientErrors.profile_photo = 'Add a clear photo of yourself.';
    if (!bio.trim()) clientErrors.bio = 'Tell casting teams a little about yourself.';
    if (!gender) clientErrors.gender = 'Choose one.';
    if (!dateOfBirth) clientErrors.date_of_birth = 'Enter your date of birth.';
    if (isActor && (height < 50 || height > 250)) clientErrors.height_cm = 'Enter your height in cm (50–250).';
    if (isMinor && !guardianName.trim()) clientErrors.guardian_name = "Enter your parent or guardian's full name.";
    if (isMinor && !guardianConsent) clientErrors.guardian_consent = 'Your parent or guardian must give consent.';
    return clientErrors;
  };

  const submit = async () => {
    const clientErrors = validate();
    setErrors(clientErrors);
    setError('');
    if (Object.keys(clientErrors).length) return setError('Please fix the highlighted fields.');

    const body = new FormData();
    body.append('username', username);
    disciplines.forEach((discipline) => body.append('disciplines', discipline));
    if (photoUri) body.append('profile_photo', toUpload({ uri: photoUri }));
    body.append('bio', bio.trim());
    body.append('gender', gender);
    body.append('date_of_birth', dateOfBirth);
    if (isActor) body.append('height_cm', String(height));
    if (isMinor) {
      body.append('guardian_name', guardianName.trim());
      body.append('guardian_consent', String(guardianConsent));
    }

    setBusy(true);
    try {
      const response = await apiClient.updateProfile(body);
      if (response.data) onProfile(response.data);
      onNext();
    } catch (caughtError) {
      // e.g. the face check on the photo: "We couldn't find a clear human face…"
      setErrors(fieldErrors(caughtError));
      setError(messageOf(caughtError, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const preview = photoUri ?? profile.profile_photo;

  return (
    <View style={{ gap: spacing.lg }}>
      <ErrorBanner message={error} />
      <FormField label="Username" error={errors.username} hint="3-30 lowercase letters, numbers, dots or underscores.">
        <TextField
          value={username}
          onChangeText={(text) => {
            setUsername(text.toLowerCase().replace(/\s/g, ''));
            setErrors((previous) => ({ ...previous, username: '' }));
          }}
          onBlur={() => void checkUsername()}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
          placeholder="yourname"
          error={errors.username}
          accessibilityLabel="Username"
        />
      </FormField>
      {suggestions.length ? (
        <View style={styles.row}>
          {suggestions.map((suggestion) => (
            <SmallButton
              key={suggestion}
              title={`@${suggestion}`}
              onPress={() => {
                setUsername(suggestion);
                setSuggestions([]);
                setErrors((previous) => ({ ...previous, username: '' }));
              }}
            />
          ))}
        </View>
      ) : null}

      <FormField label="What do you do?" error={errors.disciplines}>
        <ChipGroup options={options.disciplines} value={disciplines} onChange={setDisciplines} />
      </FormField>

      <FormField label="Profile photo" error={errors.profile_photo} hint="A real, recent photo of you: a headshot or a full-body shot. We check that your face is visible.">
        <View style={styles.photoRow}>
          <View style={styles.photo}>{preview ? <Image source={preview} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.photoEmpty}>👤</Text>}</View>
          <View style={{ flex: 1, gap: spacing.sm }}>
            <SmallButton
              title="📷 Take photo"
              onPress={() =>
                void openCamera({ facing: 'front' }).then((uri) => {
                  if (!uri) return;
                  setPhotoUri(uri);
                  setErrors((previous) => ({ ...previous, profile_photo: '' }));
                })
              }
            />
            <SmallButton title="🖼️ Choose from gallery" onPress={() => void pickPhoto()} />
          </View>
        </View>
      </FormField>

      <FormField label="About yourself" error={errors.bio}>
        <TextField value={bio} onChangeText={setBio} multiline maxLength={1000} placeholder="Training, experience, theatre, notable work…" error={errors.bio} accessibilityLabel="About yourself" />
      </FormField>

      <FormField label="Sex" error={errors.gender}>
        <SelectField value={gender} onChange={setGender} options={options.genders} placeholder="Select" />
      </FormField>

      <FormField label="Date of birth" error={errors.date_of_birth}>
        <DateField value={dateOfBirth} onChange={setDateOfBirth} error={errors.date_of_birth} />
      </FormField>

      {isMinor ? (
        <View style={styles.minor}>
          <Text style={styles.minorText}>
            {age !== null && age < 16
              ? 'You are under 16, so this account must be created and managed by your parent or legal guardian.'
              : 'You are under 18, so you need your parent or legal guardian’s consent and guidance to use Bharini.'}
          </Text>
          <FormField label="Parent or guardian's full name" error={errors.guardian_name}>
            <TextField value={guardianName} onChangeText={setGuardianName} placeholder="Full name" error={errors.guardian_name} />
          </FormField>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: guardianConsent }} onPress={() => setGuardianConsent((value) => !value)} style={styles.consent}>
            <Text style={styles.checkbox}>{guardianConsent ? '☑' : '☐'}</Text>
            <Text style={styles.consentText}>
              I am this artist&apos;s parent or legal guardian. I have read the Terms &amp; Conditions, I consent to Bharini processing their personal data,
              and I will supervise their use of the account.
            </Text>
          </Pressable>
          {errors.guardian_consent ? <Text style={styles.errorText}>{errors.guardian_consent}</Text> : null}
        </View>
      ) : null}

      {isActor ? (
        <FormField
          label="Height (cm)"
          error={errors.height_cm}
          hint={height >= 50 ? `${Math.floor(Math.round(height / 2.54) / 12)}′${Math.round(height / 2.54) % 12}″` : 'For example 170'}
        >
          <TextField value={heightCm} onChangeText={(text) => setHeightCm(text.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="170" error={errors.height_cm} />
        </FormField>
      ) : null}

      <Button title="Save & continue" busy={busy} onPress={() => void submit()} />

    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  photo: { width: 96, height: 96, borderRadius: radius.full, overflow: 'hidden', borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  photoEmpty: { fontSize: 36, opacity: 0.4 },
  minor: { gap: spacing.md, borderRadius: radius['2xl'], borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)', backgroundColor: 'rgba(245,158,11,0.1)', padding: spacing.lg },
  minorText: { color: '#fef3c7', fontSize: fontSize.sm },
  consent: { flexDirection: 'row', gap: spacing.sm },
  checkbox: { color: colors.textStrong, fontSize: fontSize.lg },
  consentText: { flex: 1, color: colors.text, fontSize: fontSize.sm },
  errorText: { color: colors.danger, fontSize: fontSize.sm },
});

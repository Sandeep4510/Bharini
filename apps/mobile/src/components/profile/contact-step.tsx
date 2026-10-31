import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ArtistProfile } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { FormField, SmallButton, TextField } from '@/components/form';
import { Button, ErrorBanner } from '@/components/ui';
import { fieldErrors, messageOf } from '@/lib/config';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "@name" or "instagram.com/name" → https link, like the web's normalizeSocial. */
function normalizeSocial(value: string, host: string) {
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(host)) return `https://${trimmed}`;
  return `https://${host}/${trimmed.replace(/^@/, '')}`;
}

function hostOf(url: string) {
  return url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
}

type Props = { profile: ArtistProfile; onProfile: (profile: ArtistProfile) => void; onNext: () => void; onBack: () => void };

/** Step 3: city, mobile (+91), optional extra email verified by PIN, and social links. */
export function ContactStep({ profile, onProfile, onNext, onBack }: Props) {
  const [location, setLocation] = useState(profile.location);
  const [phone, setPhone] = useState(profile.phone.replace(/^\+91/, ''));
  const [altEmail, setAltEmail] = useState(profile.alt_email);
  const [pin, setPin] = useState('');
  const [pinSentTo, setPinSentTo] = useState('');
  const [instagram, setInstagram] = useState(profile.instagram_url);
  const [facebook, setFacebook] = useState(profile.facebook_url);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'pin' | 'verify' | 'save'>('');

  const verified = profile.alt_email_verified && altEmail.trim().toLowerCase() === profile.alt_email.toLowerCase();

  const attempt = async (kind: 'pin' | 'verify' | 'save', action: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    setErrors({});
    try {
      await action();
    } catch (caughtError) {
      setErrors(fieldErrors(caughtError));
      setError(messageOf(caughtError, 'Something went wrong.'));
    } finally {
      setBusy('');
    }
  };

  const sendPin = () =>
    attempt('pin', async () => {
      if (!EMAIL.test(altEmail.trim())) throw new Error('Enter a valid additional email first.');
      if (altEmail.trim().toLowerCase() !== profile.alt_email.toLowerCase()) {
        const saved = await apiClient.updateProfile({ alt_email: altEmail.trim() });
        if (saved.data) onProfile(saved.data);
      }
      await apiClient.sendAltEmailPin();
      setPin('');
      setPinSentTo(altEmail.trim());
    });

  const verifyPin = () =>
    attempt('verify', async () => {
      const response = await apiClient.verifyAltEmailPin(pin);
      if (response.data) onProfile(response.data);
      setPinSentTo('');
    });

  const validate = () => {
    const clientErrors: Record<string, string> = {};
    if (!location.trim()) clientErrors.location = 'Enter your city.';
    if (!phone) clientErrors.phone = 'Enter your mobile number.';
    else if (!/^[6-9]\d{9}$/.test(phone)) clientErrors.phone = 'Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
    if (altEmail.trim() && !EMAIL.test(altEmail.trim())) clientErrors.alt_email = 'Enter a valid email, like you.work@example.com.';
    if (instagram.trim() && !/(^|\.)instagram\.com$/.test(hostOf(normalizeSocial(instagram, 'instagram.com')))) {
      clientErrors.instagram_url = 'Enter your Instagram profile, like instagram.com/yourname or @yourname.';
    }
    if (facebook.trim() && !/(^|\.)(facebook|fb)\.com$/.test(hostOf(normalizeSocial(facebook, 'facebook.com')))) {
      clientErrors.facebook_url = 'Enter your Facebook profile, like facebook.com/yourname.';
    }
    return clientErrors;
  };

  const submit = () => {
    const clientErrors = validate();
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return setError('Please fix the highlighted fields.');
    void attempt('save', async () => {
      const response = await apiClient.updateProfile({
        location: location.trim(),
        phone: `+91${phone}`,
        alt_email: altEmail.trim(),
        instagram_url: normalizeSocial(instagram, 'instagram.com'),
        facebook_url: normalizeSocial(facebook, 'facebook.com'),
      });
      if (response.data) onProfile(response.data);
      onNext();
    });
  };

  return (
    <View style={{ gap: spacing.lg }}>
      <ErrorBanner message={error} />
      <FormField label="Location" error={errors.location} hint="City and state, e.g. Mangaluru, Karnataka. Helps production teams find local talent.">
        <TextField value={location} onChangeText={setLocation} maxLength={100} placeholder="Mangaluru, Karnataka" autoComplete="postal-address-locality" error={errors.location} />
      </FormField>

      <FormField label="Mobile number" error={errors.phone} hint="Indian mobile numbers only.">
        <View style={styles.phoneRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextField
            value={phone}
            onChangeText={(text) => setPhone(text.replace(/\D/g, '').slice(0, 10))}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={10}
            placeholder="98765 43210"
            error={errors.phone}
            style={{ flex: 1 }}
          />
        </View>
      </FormField>

      <FormField label="Additional email (optional)" error={errors.alt_email} hint="A backup email casting teams can reach you on. Verify it with a PIN.">
        <TextField value={altEmail} onChangeText={setAltEmail} keyboardType="email-address" autoCapitalize="none" placeholder="you.work@example.com" error={errors.alt_email} />
      </FormField>
      {verified ? (
        <Text style={styles.verified}>✓ Verified</Text>
      ) : altEmail.trim() ? (
        <SmallButton title={busy === 'pin' ? 'Sending…' : pinSentTo ? 'Resend PIN' : 'Send PIN'} disabled={busy === 'pin'} onPress={() => void sendPin()} />
      ) : null}
      {pinSentTo && !verified ? (
        <View style={styles.pinBox}>
          <Text style={styles.verified}>✓ PIN sent to {pinSentTo}</Text>
          <Text style={styles.muted}>It can take a minute; check spam too. The PIN expires in 10 minutes.</Text>
          <View style={styles.phoneRow}>
            <TextField
              value={pin}
              onChangeText={(text) => setPin(text.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              placeholder="123456"
              error={errors.pin}
              style={{ flex: 1, letterSpacing: 6, textAlign: 'center' }}
            />
            <SmallButton title={busy === 'verify' ? 'Checking…' : 'Verify'} disabled={pin.length !== 6 || busy === 'verify'} onPress={() => void verifyPin()} />
          </View>
          {errors.pin ? <Text style={styles.error}>{errors.pin}</Text> : null}
        </View>
      ) : null}

      <FormField label="Instagram (optional)" error={errors.instagram_url}>
        <TextField value={instagram} onChangeText={setInstagram} autoCapitalize="none" placeholder="instagram.com/yourname or @yourname" error={errors.instagram_url} />
      </FormField>
      <FormField label="Facebook (optional)" error={errors.facebook_url}>
        <TextField value={facebook} onChangeText={setFacebook} autoCapitalize="none" placeholder="facebook.com/yourname" error={errors.facebook_url} />
      </FormField>

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button title="Back" variant="secondary" onPress={onBack} />
        </View>
        <View style={{ flex: 2 }}>
          <Button title="Save & continue" busy={busy === 'save'} onPress={submit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  prefix: { color: colors.text, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 12 },
  verified: { color: '#6ee7b7', fontSize: fontSize.sm, fontWeight: '600' },
  pinBox: { gap: spacing.sm, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'rgba(139,92,246,0.1)', padding: spacing.md },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
  actions: { flexDirection: 'row', gap: spacing.md },
});

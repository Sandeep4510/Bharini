import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@bharini/api-client';
import { colors, fontSize, spacing } from '@bharini/theme';

import { Button, Card, ErrorBanner, Field, Logo } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/config';


export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (caughtError) {
      // the API puts the human reason ("Invalid email or password.", "verify your email…") in field_errors.detail
      const detail = caughtError instanceof ApiError ? caughtError.fieldErrors.detail?.[0] : undefined;
      setError(detail || (caughtError instanceof Error ? caughtError.message : 'Login failed.'));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo />
            <Text style={styles.brandName}>Bharini</Text>
          </View>

          <Card>
            <View style={{ gap: spacing.xs }}>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Log in to find roles, talent and your next project.</Text>
            </View>
            <ErrorBanner message={error} />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <Field
              label="Password"
              secret
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
            <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/auth/forgot-password`)}>
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
            <Button title="Log in" busy={busy} onPress={() => void submit()} />
          </Card>

          <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/auth/register`)}>
            <Text style={styles.footer}>
              New to Bharini? <Text style={styles.link}>Create an account</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'center' },
  brandName: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm },
  link: { color: colors.accentSoft, fontSize: fontSize.sm, fontWeight: '600' },
  footer: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});

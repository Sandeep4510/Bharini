import { router, Stack } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ArtistProfile } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

import { AboutStep } from '@/components/profile/about-step';
import { ContactStep } from '@/components/profile/contact-step';
import { LanguagesStep } from '@/components/profile/languages-step';
import { PortfolioStep } from '@/components/profile/portfolio-step';
import { Button, ErrorBanner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useArtistProfile } from '@/lib/use-artist-profile';

const STEPS = ['About you', 'Languages', 'Contact', 'Portfolio'];
// which missing_fields (from the API) belong to which step: the same map as the web onboarding
const STEP_FIELDS = [
  ['username', 'disciplines', 'profile_photo', 'bio', 'gender', 'date_of_birth', 'height_cm'],
  ['languages'],
  ['location', 'phone'],
];

function firstIncompleteStep(profile: ArtistProfile) {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((field) => profile.missing_fields.includes(field)));
  return index === -1 ? STEPS.length - 1 : index;
}

/**
 * Onboarding for new artists, and "Edit profile" afterwards. Steps 1-3 are required; the portfolio is optional.
 * Uses the same /profile/ endpoints as the web onboarding.
 */
export default function OnboardingScreen() {
  const { refresh } = useAuth();
  const { profile, setProfile, options, error } = useArtistProfile();
  const [chosenStep, setChosenStep] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  if (!profile || !options) {
    return (
      <SafeAreaView style={styles.center}>
        <Stack.Screen options={{ title: 'Your profile' }} />
        {error ? <ErrorBanner message={error} /> : <Text style={styles.muted}>Loading your profile…</Text>}
      </SafeAreaView>
    );
  }

  const unlockedUpTo = firstIncompleteStep(profile);
  // a finished profile opened from "Edit profile" starts at About you
  const step = chosenStep ?? (profile.onboarding_complete ? 0 : unlockedUpTo);
  const goTo = (next: number) => {
    setChosenStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const finish = async () => {
    setFinishing(true);
    await refresh().catch(() => undefined); // onboarding_complete changed; Home needs the fresh account
    setFinishing(false);
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const stepProps = { profile, options, onProfile: setProfile };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: profile.onboarding_complete ? 'Edit profile' : 'Set up your profile',
          // new artists finish the required steps first, as on the web
          headerBackVisible: profile.onboarding_complete,
          gestureEnabled: profile.onboarding_complete,
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.steps}>
            {STEPS.map((label, index) => {
              const reachable = index <= unlockedUpTo || profile.onboarding_complete;
              const current = index === step;
              return (
                <Pressable
                  key={label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: current, disabled: !reachable }}
                  disabled={!reachable}
                  onPress={() => goTo(index)}
                  style={[styles.step, current && styles.stepCurrent, !reachable && { opacity: 0.4 }]}
                >
                  <View style={[styles.bar, index <= step && { backgroundColor: colors.accent }]} />
                  <Text style={[styles.stepLabel, current && { color: colors.textStrong, fontWeight: '600' }]} numberOfLines={1}>
                    {index + 1}. {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.title}>{STEPS[step]}</Text>

          {step === 0 ? <AboutStep {...stepProps} onNext={() => goTo(1)} /> : null}
          {step === 1 ? <LanguagesStep {...stepProps} onNext={() => goTo(2)} onBack={() => goTo(0)} /> : null}
          {step === 2 ? <ContactStep {...stepProps} onNext={() => goTo(3)} onBack={() => goTo(1)} /> : null}
          {step === 3 ? (
            <View style={{ gap: spacing.lg }}>
              {profile.completion_percent < 100 ? (
                <View style={styles.strength}>
                  <View style={styles.strengthHead}>
                    <Text style={styles.strengthLabel}>Profile strength</Text>
                    <Text style={styles.strengthValue}>{profile.completion_percent}%</Text>
                  </View>
                  <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: profile.completion_percent }}>
                    <View style={[styles.fill, { width: `${profile.completion_percent}%` }]} />
                  </View>
                  <Text style={styles.muted}>💡 Complete profiles with all photos and videos get seen far more often by casting teams.</Text>
                </View>
              ) : null}
              <PortfolioStep {...stepProps} />
              <View style={styles.actions}>
                <View style={{ flex: 1 }}>
                  <Button title="Back" variant="secondary" onPress={() => goTo(2)} />
                </View>
                <View style={{ flex: 2 }}>
                  <Button title={profile.completion_percent < 100 ? 'Skip for now' : 'Finish'} busy={finishing} onPress={() => void finish()} />
                </View>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['2xl'] },
  steps: { flexDirection: 'row', gap: spacing.xs },
  step: { flex: 1, gap: spacing.xs, borderRadius: radius.xl, borderWidth: 1, borderColor: 'transparent', padding: spacing.xs },
  stepCurrent: { borderColor: 'rgba(203, 213, 225, 0.7)', backgroundColor: 'rgba(139, 92, 246, 0.1)' },
  bar: { height: 5, borderRadius: radius.full, backgroundColor: colors.cardMuted },
  stepLabel: { color: colors.textMuted, fontSize: 11 },
  title: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  strength: { gap: spacing.sm, borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  strengthHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  strengthLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  strengthValue: { color: colors.textStrong, fontSize: fontSize['2xl'], fontWeight: '600' },
  track: { height: 10, borderRadius: radius.full, backgroundColor: colors.cardMuted, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  actions: { flexDirection: 'row', gap: spacing.md },
});

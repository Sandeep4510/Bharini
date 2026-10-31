import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import type { Option } from '@bharini/types';
import { colors, fontSize, radius, spacing } from '@bharini/theme';

/** Label above, red message below: the same field anatomy as the web forms. */
export function FormField({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function TextField({ error, style, ...input }: TextInputProps & { error?: string }) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={[styles.input, error ? { borderColor: '#ef4444' } : null, input.multiline && styles.multiline, style]}
      {...input}
    />
  );
}

/** Tappable pills for multi-select lists like disciplines. */
export function ChipGroup({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (value: string[]) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(on ? value.filter((item) => item !== option.value) : [...value, option.value])}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && { color: colors.textStrong }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-width select in the app's style: tap to open a sheet of options. Same look on Android and iOS. */
export function SelectField({ value, onChange, options, placeholder }: { value: string; onChange: (value: string) => void; options: Option[]; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${placeholder}: ${selected?.label ?? 'not set'}`} onPress={() => setOpen(true)} style={[styles.input, styles.dateButton]}>
        <Text style={{ color: selected ? colors.textStrong : colors.textMuted, fontSize: fontSize.base }}>{selected?.label ?? placeholder}</Text>
        <Text style={{ color: colors.textMuted }}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{placeholder}</Text>
          <FlatList
            data={options}
            keyExtractor={(option) => option.value}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <Text style={[styles.optionText, on && { color: colors.textStrong, fontWeight: '600' }]}>{item.label}</Text>
                  {on ? <Text style={{ color: colors.accentSoft }}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Date of birth with the native date picker. Value is 'YYYY-MM-DD', the API's format. */
export function DateField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const current = value ? new Date(`${value}T00:00:00`) : new Date(today.getFullYear() - 20, 0, 1);
  const label = value ? current.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Select your date of birth';

  // Android shows a dialog while mounted; iOS renders the picker inline
  if (Platform.OS === 'ios') {
    return <DateTimePicker value={current} mode="date" maximumDate={today} themeVariant="dark" accentColor={colors.accent} onValueChange={(_, date) => onChange(toIsoDate(date))} />;
  }
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.input, styles.dateButton, error ? { borderColor: '#ef4444' } : null]}>
        <Text style={{ color: value ? colors.textStrong : colors.textMuted, fontSize: fontSize.base }}>{label}</Text>
        <Text style={{ color: colors.textMuted }}>📅</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={current}
          mode="date"
          maximumDate={today}
          accentColor={colors.accent}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(toIsoDate(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** A compact secondary action such as "Camera" or "Gallery" inside an upload card. */
export function SmallButton({ title, label, onPress, disabled = false, danger = false }: { title: string; label?: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.small, danger && { borderColor: 'rgba(248,113,113,0.5)' }, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={[styles.smallText, danger && { color: colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

export const formStyles = StyleSheet.create({
  section: { gap: spacing.lg, borderRadius: radius['3xl'], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: spacing.lg },
  sectionTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
});

const styles = StyleSheet.create({
  label: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  error: { color: colors.danger, fontSize: fontSize.sm },
  hint: { color: colors.textMuted, fontSize: fontSize.xs },
  input: { color: colors.textStrong, fontSize: fontSize.base, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.xl, backgroundColor: 'rgba(2, 8, 23, 0.7)', paddingHorizontal: 14, paddingVertical: 12 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  dateButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  chipOn: { borderColor: colors.accentHover, backgroundColor: 'rgba(139, 92, 246, 0.2)' },
  chipText: { color: colors.text, fontSize: fontSize.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.7)' },
  sheet: { gap: spacing.sm, backgroundColor: colors.card, borderTopLeftRadius: radius['3xl'], borderTopRightRadius: radius['3xl'], borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.xl, paddingBottom: spacing['2xl'] },
  sheetTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: '600', marginBottom: spacing.sm },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: 14 },
  optionOn: { backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  optionText: { color: colors.text, fontSize: fontSize.base },
  small: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, alignItems: 'center' },
  smallText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '600' },
});

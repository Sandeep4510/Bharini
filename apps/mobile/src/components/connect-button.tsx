import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { apiClient } from '@bharini/api-client';
import type { ConnectionStatus } from '@bharini/types';
import { colors, fontSize, spacing } from '@bharini/theme';

import { Button, ErrorBanner } from '@/components/ui';

/** Connect / Pending / Accept + Ignore / Connected, the same states as the web button (POST or DELETE /users/<id>/connect/). */
export function ConnectButton({ userId, status, onChange }: { userId: number; status: ConnectionStatus; onChange: (status: ConnectionStatus) => void }) {
  const [busy, setBusy] = useState<'' | 'yes' | 'no'>('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');

  const run = async (connect: boolean) => {
    setBusy(connect ? 'yes' : 'no');
    setError('');
    try {
      const response = await apiClient.setConnection(userId, connect);
      if (response.data) onChange(response.data.connection);
      setConfirmRemove(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update the connection.');
    } finally {
      setBusy('');
    }
  };

  let content;
  if (status === 'pending_received') {
    content = (
      <View style={styles.pair}>
        <View style={{ flex: 1 }}>
          <Button title="Accept" busy={busy === 'yes'} onPress={() => void run(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Ignore" variant="secondary" busy={busy === 'no'} onPress={() => void run(false)} />
        </View>
      </View>
    );
  } else if (status === 'pending_sent') {
    content = <Button title="Pending · Withdraw" variant="secondary" busy={busy === 'no'} onPress={() => void run(false)} />;
  } else if (status === 'connected') {
    content = confirmRemove ? (
      <View style={{ gap: spacing.sm }}>
        <Text style={styles.confirm}>Remove this connection? You will no longer be able to message each other.</Text>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Button title="Remove" variant="secondary" busy={busy === 'no'} onPress={() => void run(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Keep" variant="secondary" onPress={() => setConfirmRemove(false)} />
          </View>
        </View>
      </View>
    ) : (
      <Button title="✓ Connected" variant="secondary" onPress={() => setConfirmRemove(true)} />
    );
  } else {
    content = <Button title="Connect" busy={busy === 'yes'} onPress={() => void run(true)} />;
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {content}
      <ErrorBanner message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: spacing.sm },
  confirm: { color: colors.text, fontSize: fontSize.sm, textAlign: 'center' },
});

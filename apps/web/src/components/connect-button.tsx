'use client';

import { useState } from 'react';

import { apiClient } from '@bharini/api-client';
import type { ConnectionStatus } from '@bharini/types';

import { errorMessage, primaryButton, secondaryButton } from '@/components/profile-fields';

/** Connect / Pending / Accept / Connected, LinkedIn style. Separate from Follow. */
export function ConnectButton({
  userId,
  status,
  onChange,
  compact = false,
}: {
  userId: number;
  status: ConnectionStatus;
  onChange: (status: ConnectionStatus) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState('');
  const size = compact ? ' px-3! py-1.5! text-xs' : '';

  const run = async (connect: boolean) => {
    setBusy(true);
    setError('');
    try {
      const response = await apiClient.setConnection(userId, connect);
      if (response.data) onChange(response.data.connection);
      setConfirmRemove(false);
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Could not update connection.'));
    } finally {
      setBusy(false);
    }
  };

  const buttons =
    status === 'pending_received' ? (
      <>
        <button type="button" disabled={busy} onClick={() => void run(true)} className={primaryButton + size}>
          Accept
        </button>
        <button type="button" disabled={busy} onClick={() => void run(false)} className={secondaryButton + size}>
          Ignore
        </button>
      </>
    ) : status === 'pending_sent' ? (
      <button type="button" disabled={busy} onClick={() => void run(false)} title="Withdraw request" className={secondaryButton + size}>
        Pending · Withdraw
      </button>
    ) : status === 'connected' ? (
      confirmRemove ? (
        <>
          <button type="button" disabled={busy} onClick={() => void run(false)} className={`${secondaryButton}${size} hover:border-red-400! hover:text-red-200!`}>
            Remove connection
          </button>
          <button type="button" onClick={() => setConfirmRemove(false)} className={secondaryButton + size}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirmRemove(true)} className={secondaryButton + size}>
          ✓ Connected
        </button>
      )
    ) : (
      <button type="button" disabled={busy} onClick={() => void run(true)} className={primaryButton + size}>
        Connect
      </button>
    );

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {buttons}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </span>
  );
}

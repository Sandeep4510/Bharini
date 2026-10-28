'use client';

import { useState } from 'react';

import { apiClient } from '@bharini/api-client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { secondaryButton } from '@/components/profile-fields';

/** Block (after a confirmation pop-up) or unblock another account. */
export function BlockButton({
  userId,
  name,
  blocked,
  onChange,
}: {
  userId: number;
  name: string;
  blocked: boolean;
  onChange: (blocked: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const unblock = async () => {
    setBusy(true);
    try {
      const response = await apiClient.setBlocked(userId, false);
      onChange(response.data?.is_blocked ?? false);
    } finally {
      setBusy(false);
    }
  };

  if (blocked) {
    return (
      <button type="button" disabled={busy} onClick={() => void unblock()} className={secondaryButton}>
        Unblock
      </button>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setConfirming(true)} className={`${secondaryButton} text-red-300 hover:text-red-200`}>
        Block
      </button>
      {confirming ? (
        <ConfirmDialog
          title={`Block ${name}?`}
          confirmLabel="Block"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const response = await apiClient.setBlocked(userId, true);
            setConfirming(false);
            onChange(response.data?.is_blocked ?? true);
          }}
        >
          <p>All the posts and messages from {name} will not be visible for you.</p>
          <p>You will also be disconnected and stop following each other. You can unblock them later from Settings.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

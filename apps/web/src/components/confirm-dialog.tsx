'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { dangerButton, errorMessage, secondaryButton } from '@/components/profile-fields';

/** Pop-up asking "are you sure?"; `onConfirm` errors show inside the dialog instead of closing it. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (caughtError) {
      setError(errorMessage(caughtError, 'Something went wrong. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-3xl border border-slate-700 bg-slate-900 p-6 text-white"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="space-y-2 text-sm text-slate-300">{children}</div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={() => void confirm()} disabled={busy} className={dangerButton}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

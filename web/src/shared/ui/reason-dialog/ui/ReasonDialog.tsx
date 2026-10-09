import { useEffect, useState } from "react";
import { ITButton, ITDialog, ITFlex, ITText, ITTextarea } from "@axzydev/axzy_ui_system";

interface Props {
  isOpen: boolean;
  title: string;
  message?: string;
  label: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Texto de error si el motivo es muy corto. */
  requiredMessage: string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

/** Confirmación que exige un motivo (cancelaciones con bitácora). */
export default function ReasonDialog({ isOpen, title, message, label, confirmLabel, cancelLabel, requiredMessage, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError(null);
    }
  }, [isOpen]);

  const confirm = async () => {
    if (reason.trim().length < 3) {
      setError(requiredMessage);
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <ITDialog isOpen={isOpen} onClose={onClose} title={title} className="w-full max-w-lg">
      <div role="dialog" aria-label={title}>
        <ITFlex direction="column" gap={4}>
          {message && <ITText className="text-[12px] text-slate-600">{message}</ITText>}
          <ITTextarea name="reason" label={label} value={reason} onChange={setReason} rows={3} maxLength={500} error={error ?? undefined} />
          <ITFlex justify="end" gap={2}>
            <ITButton variant="outlined" color="secondary" onClick={onClose}>{cancelLabel}</ITButton>
            <ITButton variant="filled" color="danger" disabled={busy} onClick={() => void confirm()}>{confirmLabel}</ITButton>
          </ITFlex>
        </ITFlex>
      </div>
    </ITDialog>
  );
}

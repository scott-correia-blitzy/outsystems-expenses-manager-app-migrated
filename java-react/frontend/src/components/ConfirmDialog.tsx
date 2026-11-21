import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

// MUI aria-hides the page while a dialog is open, so focus leaves the trigger first and returns once the page is shown.
export function useDialogFocus(open: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const mounted = useRef(false);

  const restoreFocus = useCallback(() => {
    const target = trigger.current;
    trigger.current = null;
    const active = document.activeElement;
    if (target?.isConnected && (active === null || active === document.body)) {
      target.focus();
    }
  }, []);

  useLayoutEffect(() => {
    const active = document.activeElement;
    if (open && active instanceof HTMLElement && active !== document.body) {
      trigger.current = active;
      active.blur();
    }
  }, [open]);

  useEffect(() => {
    const active = document.activeElement;
    if (!open && active instanceof HTMLElement && dialogRef.current?.contains(active)) {
      active.blur();
    }
  }, [open]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) {
          restoreFocus();
        }
      });
    };
  }, [restoreFocus]);

  return {
    ref: dialogRef,
    disableRestoreFocus: true,
    slotProps: { transition: { onExited: restoreFocus } },
  };
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Yes, delete it',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const dialogFocus = useDialogFocus(open);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      // The caller reports failures; this only keeps the rejection from going unhandled.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      {...dialogFocus}
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="md"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText id={messageId}>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1, paddingInline: 2, paddingBlockEnd: 2 }}>
          <Button
            variant="contained"
            color="error"
            loading={busy}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </Button>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

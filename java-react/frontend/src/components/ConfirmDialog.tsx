import { type RefObject, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

type FocusReturn = {
  dialog: RefObject<HTMLDivElement | null>;
  open: RefObject<boolean>;
  returnTargets: RefObject<HTMLElement[]>;
};

// A dialog opened from inside another may outlive it, so it also inherits that dialog's return targets.
const mountedDialogs = new Set<FocusReturn>();

function dialogHolding(element: HTMLElement): FocusReturn | undefined {
  for (const entry of mountedDialogs) {
    if (entry.dialog.current?.contains(element)) {
      return entry;
    }
  }
  return undefined;
}

// A control in a closing dialog disappears with it, so focus goes on to that dialog's own opener.
function canTakeFocus(target: HTMLElement): boolean {
  const holder = dialogHolding(target);
  return target.isConnected && !target.matches(':disabled') && (holder === undefined || holder.open.current);
}

// MUI aria-hides the page while a dialog is open, so focus leaves the trigger first and returns once the page is shown.
export function useDialogFocus(open: boolean) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isOpen = useRef(open);
  const returnTargets = useRef<HTMLElement[]>([]);
  const mounted = useRef(false);

  const restoreFocus = useCallback(() => {
    const targets = returnTargets.current;
    returnTargets.current = [];
    const active = document.activeElement;
    if (active === null || active === document.body) {
      targets.find(canTakeFocus)?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    isOpen.current = open;
    const active = document.activeElement;
    if (open && active instanceof HTMLElement && active !== document.body) {
      returnTargets.current = [active, ...(dialogHolding(active)?.returnTargets.current ?? [])];
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
    const entry: FocusReturn = { dialog: dialogRef, open: isOpen, returnTargets };
    mountedDialogs.add(entry);
    mounted.current = true;
    return () => {
      mountedDialogs.delete(entry);
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
  // Busy disables the button only after a re-render, too late for a second click in the same task.
  const inFlight = useRef(false);

  const handleConfirm = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      // The caller reports failures; this only keeps the rejection from going unhandled.
    } finally {
      inFlight.current = false;
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

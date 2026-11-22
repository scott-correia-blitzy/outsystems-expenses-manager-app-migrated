import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  Alert,
  Box,
  List,
  ListItem,
  ListItemText,
  Portal,
  Snackbar,
  type SnackbarCloseReason,
} from '@mui/material';
import { ApiError, MESSAGES, type FieldError } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type Severity = 'success' | 'info' | 'warning' | 'error';

type FeedbackMessage = {
  severity: Severity;
  text: string;
  details: string[];
  key: number;
};

export type FeedbackApi = {
  success(msg: string): void;
  info(msg: string): void;
  warning(msg: string): void;
  error(err: unknown): void;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

// Modals opened after the toast aria-hide every other body child, though the toast stays visible and clickable.
function keepToastExposed(root: HTMLDivElement | null) {
  if (root === null) return;
  const observer = new MutationObserver(() => {
    if (root.getAttribute('aria-hidden') === 'true') {
      root.removeAttribute('aria-hidden');
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['aria-hidden'] });
  return () => observer.disconnect();
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [open, setOpen] = useState(false);
  const lastKey = useRef(0);

  const show = useCallback((severity: Severity, text: string, details: string[] = []) => {
    lastKey.current += 1;
    setMessage({ severity, text, details, key: lastKey.current });
    setOpen(true);
  }, []);

  const { sessionEndedByLogout } = useAuth();
  const api = useMemo<FeedbackApi>(
    () => ({
      success: (msg) => show('success', msg),
      info: (msg) => show('info', msg),
      warning: (msg) => show('warning', msg),
      error: (err) => {
        if (err instanceof ApiError) {
          // A logout the user chose already leads to Login, so the 401s it causes need no message.
          if (err.status === 401 && sessionEndedByLogout()) {
            return;
          }
          // A JSON null survives the constructor default, so fieldErrors may still be missing at run time.
          const details = new Set(err.fieldErrors?.map((f) => f.message) ?? []);
          details.delete(err.message);
          show('error', err.message, [...details]);
        } else {
          show('error', MESSAGES.GENERIC_ERROR);
        }
      },
    }),
    [show, sessionEndedByLogout],
  );

  const handleSnackbarClose = (_event: SyntheticEvent | Event, reason: SnackbarCloseReason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const handleAlertClose = () => setOpen(false);

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {message && (
        // An open Dialog marks the app root aria-hidden, so the toast lives in body to stay announced.
        <Portal>
          <Snackbar
            key={message.key}
            ref={keepToastExposed}
            open={open}
            autoHideDuration={6000}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            onClose={handleSnackbarClose}
          >
            <Alert
              severity={message.severity}
              variant="filled"
              onClose={handleAlertClose}
              sx={{ width: '100%' }}
            >
              {message.text}
              {message.details.length > 0 && (
                <List dense disablePadding>
                  {message.details.map((line, index) => (
                    <ListItem key={index} disablePadding>
                      <ListItemText primary={line} />
                    </ListItem>
                  ))}
                </List>
              )}
            </Alert>
          </Snackbar>
        </Portal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const feedback = useContext(FeedbackContext);
  if (!feedback) {
    throw new Error('useFeedback must be used inside FeedbackProvider');
  }
  return feedback;
}

// The server's message usually repeats the first field error, so the toast leaves out what the form already shows.
export function unplacedError(
  err: ApiError,
  unplaced: readonly FieldError[],
  messageShown = false,
): ApiError | null {
  const isUnplaced = (fieldError: FieldError) =>
    unplaced.some((other) => other.field === fieldError.field && other.message === fieldError.message);
  const messagePlaced = (err.fieldErrors ?? []).some(
    (fieldError) => fieldError.message === err.message && !isUnplaced(fieldError),
  );
  const pending = messageShown ? unplaced.filter((fieldError) => fieldError.message !== err.message) : [...unplaced];
  if (pending.length === 0) {
    return null;
  }
  const headline = messageShown || messagePlaced ? pending[0].message : err.message;
  return new ApiError(err.status, err.code, headline, pending);
}

// The zero inset keeps the box inside its containing block, so it never adds scrollable overflow.
export const VISUALLY_HIDDEN = {
  position: 'absolute',
  insetBlockStart: 0,
  insetInlineStart: 0,
  inlineSize: 1,
  blockSize: 1,
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
} as const;

// Screen readers announce only changes to an existing region, so pages mount this before its text.
export function LiveStatus({ message }: { message: string }) {
  return (
    <Box role="status" sx={VISUALLY_HIDDEN}>
      {message}
    </Box>
  );
}

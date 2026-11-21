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
  List,
  ListItem,
  ListItemText,
  Snackbar,
  type SnackbarCloseReason,
} from '@mui/material';
import { ApiError, MESSAGES } from '../api/types';

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

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const [open, setOpen] = useState(false);
  const lastKey = useRef(0);

  const show = useCallback((severity: Severity, text: string, details: string[] = []) => {
    lastKey.current += 1;
    setMessage({ severity, text, details, key: lastKey.current });
    setOpen(true);
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      success: (msg) => show('success', msg),
      info: (msg) => show('info', msg),
      warning: (msg) => show('warning', msg),
      error: (err) => {
        if (err instanceof ApiError) {
          // A JSON null survives the constructor default, so fieldErrors may still be missing at run time.
          const details = err.fieldErrors?.map((f) => `${f.field}: ${f.message}`) ?? [];
          show('error', err.message, details);
        } else {
          show('error', MESSAGES.GENERIC_ERROR);
        }
      },
    }),
    [show],
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
        <Snackbar
          key={message.key}
          open={open}
          autoHideDuration={6000}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
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

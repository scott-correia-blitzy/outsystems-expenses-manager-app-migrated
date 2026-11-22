import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  FormControlLabel,
  Stack,
  TextField,
} from '@mui/material';
import { ApiError, MESSAGES, type FieldError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { unplacedError, useFeedback } from '../components/Feedback';
import { PageHeader } from '../layout/PageHeader';
import { safeRedirectTarget } from '../routes';

type LoginField = 'username' | 'password';
type FieldErrors = Record<LoginField, string>;

const NO_ERRORS: FieldErrors = { username: '', password: '' };

function isLoginField(field: string): field is LoginField {
  return field === 'username' || field === 'password';
}

function serverFieldErrors(fieldErrors: readonly FieldError[]): { fields: FieldErrors; unplaced: FieldError[] } {
  const fields: FieldErrors = { ...NO_ERRORS };
  const unplaced: FieldError[] = [];
  for (const fieldError of fieldErrors) {
    if (isLoginField(fieldError.field)) {
      const current = fields[fieldError.field];
      fields[fieldError.field] = current === '' ? fieldError.message : `${current}\n${fieldError.message}`;
    } else {
      unplaced.push(fieldError);
    }
  }
  return { fields, unplaced };
}

export function LoginPage() {
  const { login } = useAuth();
  const feedback = useFeedback();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  const handleUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUsername(event.target.value);
    setErrors((prev) => ({ ...prev, username: '' }));
  };

  const handlePasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value);
    setErrors((prev) => ({ ...prev, password: '' }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setFormError(null);
    const nextErrors: FieldErrors = {
      username: username.trim() === '' ? MESSAGES.FIELD_REQUIRED : '',
      password: password.trim() === '' ? MESSAGES.FIELD_REQUIRED : '',
    };
    setErrors(nextErrors);
    if (nextErrors.username !== '') {
      usernameInput.current?.focus();
      return;
    }
    if (nextErrors.password !== '') {
      passwordInput.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const user = await login({ username, password, rememberMe });
      const from = (location.state as { from?: unknown } | null)?.from;
      navigate(safeRedirectTarget(from) ?? user.landingRoute, { replace: true });
    } catch (err) {
      let focusTarget = passwordInput;
      if (err instanceof ApiError) {
        const { fields, unplaced } = serverFieldErrors(err.fieldErrors ?? []);
        setFormError(err.message);
        setErrors(fields);
        if (fields.username !== '') {
          focusTarget = usernameInput;
        }
        const toastError = unplaced.length > 0 ? unplacedError(err, unplaced, true) : null;
        if (toastError) {
          feedback.error(toastError);
        }
      } else {
        setFormError(MESSAGES.GENERIC_ERROR);
      }
      focusTarget.current?.focus();
      // Not in a finally block: on success the session redirect unmounts this page.
      setSubmitting(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs" sx={{ py: 8 }}>
      <Card>
        <CardContent>
          <Box component="form" noValidate onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <PageHeader title="Login" />
              <TextField
                label="Username"
                name="username"
                value={username}
                onChange={handleUsernameChange}
                inputRef={usernameInput}
                autoComplete="username"
                autoFocus
                required
                fullWidth
                error={errors.username !== ''}
                helperText={errors.username || undefined}
                slotProps={{ formHelperText: { sx: { whiteSpace: 'pre-line' } } }}
              />
              <TextField
                label="Password"
                name="password"
                type="password"
                value={password}
                onChange={handlePasswordChange}
                inputRef={passwordInput}
                autoComplete="current-password"
                required
                fullWidth
                error={errors.password !== ''}
                helperText={errors.password || undefined}
                slotProps={{ formHelperText: { sx: { whiteSpace: 'pre-line' } } }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    name="rememberMe"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                  />
                }
                label="Remember me"
              />
              {formError !== null && <Alert severity="error">{formError}</Alert>}
              <Button type="submit" variant="contained" fullWidth loading={submitting}>
                Login
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

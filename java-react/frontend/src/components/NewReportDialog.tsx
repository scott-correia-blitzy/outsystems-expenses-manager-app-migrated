import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { createReport } from '../api/api';
import {
  ApiError,
  MESSAGES,
  type CreateReportBody,
  type FieldError,
  type Kind,
  type ReportSummary,
} from '../api/types';
import { reportPath } from '../routes';
import { useDialogFocus } from './ConfirmDialog';
import { unplacedError, useFeedback } from './Feedback';

export type NewReportDialogProps = {
  open: boolean;
  onClose: () => void;
};

type FieldName = 'title' | 'kind';

type FieldErrors = Partial<Record<FieldName, string>>;

const TITLE_MAX_LENGTH = 50;

function validate(title: string, kind: Kind | null): FieldErrors {
  const errors: FieldErrors = {};
  const trimmed = title.trim();
  if (trimmed === '') {
    errors.title = MESSAGES.INSERT_TITLE;
  } else if (trimmed.length > TITLE_MAX_LENGTH) {
    errors.title = MESSAGES.MAX_LENGTH_50;
  }
  if (kind === null) {
    errors.kind = MESSAGES.SELECT_REPORT_TYPE;
  }
  return errors;
}

function isFieldName(field: string): field is FieldName {
  return field === 'title' || field === 'kind';
}

export function NewReportDialog({ open, onClose }: NewReportDialogProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const titleId = useId();
  const formId = useId();
  const kindLabelId = useId();
  const kindHelperId = useId();
  const dialogFocus = useDialogFocus(open);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const kindGroup = useRef<HTMLDivElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  // Unlike saving, the ref updates at once, so a second submit before the next render is ignored.
  const saveInFlight = useRef(false);
  const [failedSaves, setFailedSaves] = useState(0);
  const [errorFocus, setErrorFocus] = useState<{ field: FieldName } | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setKind(null);
      setErrors({});
      setSaving(false);
      saveInFlight.current = false;
    }
  }, [open]);

  // Saving disables Submit and the fields, so focus is lost; it is restored once they are enabled again.
  useEffect(() => {
    if (failedSaves > 0 && !formRef.current?.contains(document.activeElement)) {
      submitButton.current?.focus();
    }
  }, [failedSaves]);

  useEffect(() => {
    if (errorFocus?.field === 'title') {
      titleInput.current?.focus();
    } else if (errorFocus?.field === 'kind') {
      kindGroup.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }, [errorFocus]);

  const clearError = (name: FieldName) =>
    setErrors((prev) => (prev[name] === undefined ? prev : { ...prev, [name]: undefined }));

  // Focus waits for the render that re-enables a field a failed save left disabled.
  const showErrors = (next: FieldErrors) => {
    setErrors(next);
    if (next.title) {
      setErrorFocus({ field: 'title' });
    } else if (next.kind) {
      setErrorFocus({ field: 'kind' });
    }
  };

  const showFailure = (err: unknown) => {
    const fieldErrors = err instanceof ApiError ? (err.fieldErrors ?? []) : [];
    const placed: FieldErrors = {};
    const unplaced: FieldError[] = [];
    for (const { field, message } of fieldErrors) {
      if (isFieldName(field)) {
        const current = placed[field];
        placed[field] = current === undefined ? message : `${current}\n${message}`;
      } else {
        unplaced.push({ field, message });
      }
    }
    showErrors(placed);
    if (Object.keys(placed).length === 0) {
      setFailedSaves((count) => count + 1);
    }
    const toastError = err instanceof ApiError && unplaced.length > 0 ? unplacedError(err, unplaced) : null;
    if (fieldErrors.length === 0) {
      feedback.error(err);
    } else if (toastError) {
      feedback.error(toastError);
    }
  };

  const submit = async () => {
    const clientErrors = validate(title, kind);
    if (kind === null || Object.keys(clientErrors).length > 0) {
      showErrors(clientErrors);
      return;
    }
    setErrors({});
    const body: CreateReportBody = { kind, title: title.trim() };
    saveInFlight.current = true;
    setSaving(true);
    let created: ReportSummary;
    try {
      created = await createReport(body);
    } catch (err) {
      saveInFlight.current = false;
      setSaving(false);
      showFailure(err);
      return;
    }
    // saving stays set until the next open, so the form remains disabled while the dialog fades out.
    onClose();
    void navigate(reportPath(kind, created.id));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saveInFlight.current) {
      void submit();
    }
  };

  return (
    <Dialog
      {...dialogFocus}
      open={open}
      onClose={saving ? undefined : onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>New Report</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          ref={formRef}
          id={formId}
          noValidate
          onSubmit={handleSubmit}
          spacing={3}
          useFlexGap
          sx={{ paddingBlockStart: 1 }}
        >
          <TextField
            name="title"
            label="Report Title"
            autoFocus
            fullWidth
            disabled={saving}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              clearError('title');
            }}
            error={Boolean(errors.title)}
            helperText={errors.title}
            inputRef={titleInput}
            slotProps={{
              htmlInput: { 'aria-required': true },
              formHelperText: { sx: { whiteSpace: 'pre-line' } },
            }}
          />
          <FormControl error={Boolean(errors.kind)} fullWidth>
            <Stack spacing={1} useFlexGap>
              <FormLabel id={kindLabelId} component="span" required>
                Report Type
              </FormLabel>
              <ToggleButtonGroup
                ref={kindGroup}
                exclusive
                fullWidth
                size="small"
                color="primary"
                disabled={saving}
                value={kind}
                onChange={(_event, value: Kind | null) => {
                  if (value !== null) {
                    setKind(value);
                    clearError('kind');
                  }
                }}
                aria-labelledby={kindLabelId}
                aria-describedby={errors.kind ? kindHelperId : undefined}
              >
                <ToggleButton value="expense">Expense</ToggleButton>
                <ToggleButton value="earning">Earning</ToggleButton>
              </ToggleButtonGroup>
              {errors.kind && (
                <FormHelperText id={kindHelperId} sx={{ whiteSpace: 'pre-line' }}>
                  {errors.kind}
                </FormHelperText>
              )}
            </Stack>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1, paddingInline: 2, paddingBlockEnd: 2 }}>
          <Button ref={submitButton} type="submit" form={formId} variant="contained" loading={saving}>
            Submit
          </Button>
          <Button variant="outlined" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

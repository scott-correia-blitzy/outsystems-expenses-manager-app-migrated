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
import { ApiError, MESSAGES, type CreateReportBody, type Kind, type ReportSummary } from '../api/types';
import { reportPath } from '../routes';
import { useFeedback } from './Feedback';

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
  const formRef = useRef<HTMLFormElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const kindGroup = useRef<HTMLDivElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failedSaves, setFailedSaves] = useState(0);

  useEffect(() => {
    if (open) {
      setTitle('');
      setKind(null);
      setErrors({});
      setSaving(false);
    }
  }, [open]);

  // Submit is disabled while saving, so a click-started save loses focus; it is restored once enabled again.
  useEffect(() => {
    if (failedSaves > 0 && !formRef.current?.contains(document.activeElement)) {
      submitButton.current?.focus();
    }
  }, [failedSaves]);

  const clearError = (name: FieldName) =>
    setErrors((prev) => (prev[name] === undefined ? prev : { ...prev, [name]: undefined }));

  const showErrors = (next: FieldErrors) => {
    setErrors(next);
    if (next.title) {
      titleInput.current?.focus();
    } else if (next.kind) {
      kindGroup.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  };

  const showFailure = (err: unknown) => {
    const fieldErrors = err instanceof ApiError ? (err.fieldErrors ?? []) : [];
    const placed: FieldErrors = {};
    let unplaced = fieldErrors.length === 0;
    for (const { field, message } of fieldErrors) {
      if (isFieldName(field)) {
        placed[field] ??= message;
      } else {
        unplaced = true;
      }
    }
    showErrors(placed);
    if (Object.keys(placed).length === 0) {
      setFailedSaves((count) => count + 1);
    }
    if (unplaced) {
      feedback.error(err);
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
    setSaving(true);
    let created: ReportSummary;
    try {
      created = await createReport(body);
    } catch (err) {
      setSaving(false);
      showFailure(err);
      return;
    }
    // saving stays set until the next open, so the buttons remain disabled while the dialog fades out.
    onClose();
    void navigate(reportPath(kind, created.id));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saving) {
      void submit();
    }
  };

  return (
    <Dialog
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
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              clearError('title');
            }}
            error={Boolean(errors.title)}
            helperText={errors.title}
            inputRef={titleInput}
            slotProps={{ htmlInput: { 'aria-required': true } }}
          />
          <FormControl error={Boolean(errors.kind)} fullWidth sx={{ gap: 1 }}>
            <FormLabel id={kindLabelId} component="span" required>
              Report Type
            </FormLabel>
            <ToggleButtonGroup
              ref={kindGroup}
              exclusive
              fullWidth
              color="primary"
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
            {errors.kind && <FormHelperText id={kindHelperId}>{errors.kind}</FormHelperText>}
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'flex-start', paddingInline: 3, paddingBlockEnd: 3 }}>
        <Button ref={submitButton} type="submit" form={formId} variant="contained" loading={saving}>
          Submit
        </Button>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}

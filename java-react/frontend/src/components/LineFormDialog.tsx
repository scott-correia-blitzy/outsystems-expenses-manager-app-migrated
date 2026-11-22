import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
} from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormHelperText,
  FormLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  SvgIcon,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  type SvgIconProps,
} from '@mui/material';
import { createLine, updateLine, uploadInvoice } from '../api/api';
import {
  ApiError,
  MESSAGES,
  type EarningLineBody,
  type ExpenseLineBody,
  type FieldError,
  type Kind,
  type LineBody,
  type LineView,
  type RefItem,
  type ReferenceData,
} from '../api/types';
import { formatEuro } from '../format/format';
import { useDialogFocus } from './ConfirmDialog';
import { useFeedback } from './Feedback';
import { SelectLabel } from './LineTable';
import { vatLabel } from './LineViewDialog';

export type LineFormDialogProps = {
  open: boolean;
  kind: Kind;
  report: { id: number; title: string };
  line?: LineView;
  reference: ReferenceData;
  onClose: () => void;
  onSaved: (saved: LineView) => void;
  onStored: (saved: LineView) => void;
  onConflict: () => void;
};

type FieldName =
  | 'date'
  | 'typeId'
  | 'title'
  | 'currencyId'
  | 'description'
  | 'amount'
  | 'kilometers'
  | 'file';

type FieldErrors = Partial<Record<FieldName, string>>;

type FormState = {
  date: string;
  typeId: number | '';
  title: string;
  currencyId: number;
  description: string;
  amount: string;
  kilometers: string;
};

// units × 10^-scale, held exactly like a BigDecimal.
type Decimal = { units: bigint; scale: number };

// Static record ids of the Currency and ExpenseType reference tables.
const EURO_ID = 1;
const DOLLAR_ID = 2;
const KILOMETERS_TYPE_ID = 3;

// The server's scales: Distance DECIMAL(37,8), Amount and AmountInEuros DECIMAL(19,4), money output 2 decimals.
const DISTANCE_SCALE = 8;
const STORED_SCALE = 4;
const MONEY_SCALE = 2;

const TITLE_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 1500;
const ACCEPTED_INVOICE_TYPES = '.pdf,.png,.jpg,.jpeg';
// MUI Select mirrors aria-invalid onto a hidden native input, which must not take focus.
const FIRST_INVALID_CONTROL = '[aria-invalid="true"]:not([aria-hidden="true"]):not([tabindex="-1"])';
const MULTILINE_HELPER_SX = { whiteSpace: 'pre-line' } as const;

const CURRENCY_CODES: Record<number, string> = { [EURO_ID]: 'EUR', [DOLLAR_ID]: 'USD' };

const SERVER_FIELDS: Record<string, FieldName> = {
  date: 'date',
  expenseTypeId: 'typeId',
  earningTypeId: 'typeId',
  title: 'title',
  currencyId: 'currencyId',
  description: 'description',
  amount: 'amount',
  kilometers: 'kilometers',
  file: 'file',
};

function CloseIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </SvgIcon>
  );
}

function UploadIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 20h14v-2H5zm0-10h4v6h6v-6h4l-7-7z" />
    </SvgIcon>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// Local calendar date: toISOString would shift it to UTC.
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// String() of a number is the decimal JSON sends to the server; a blank or invalid entry previews as 0.
function toDecimal(value: string | number): Decimal {
  const parsed = Number(value);
  const finite = Number.isFinite(parsed) ? parsed : 0;
  const [mantissa, exponent = '0'] = String(Math.abs(finite)).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponent);
  const magnitude = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, -scale));
  return { units: finite < 0 ? -magnitude : magnitude, scale: Math.max(0, scale) };
}

function multiply(a: Decimal, b: Decimal): Decimal {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

function roundHalfUp({ units, scale }: Decimal, target: number): Decimal {
  if (target >= scale) {
    return { units: units * 10n ** BigInt(target - scale), scale: target };
  }
  const divisor = 10n ** BigInt(scale - target);
  const magnitude = ((units < 0n ? -units : units) + divisor / 2n) / divisor;
  return { units: units < 0n ? -magnitude : magnitude, scale: target };
}

// Converted the way a saved line's JSON figure is, so the preview and the View dialog render alike.
function toNumber({ units, scale }: Decimal): number {
  return Number(`${units}e-${scale}`);
}

function convertedEuros(value: string, valueScale: number, rate: number): Decimal {
  return roundHalfUp(multiply(roundHalfUp(toDecimal(value), valueScale), toDecimal(rate)), STORED_SCALE);
}

// Follows the server's rounding steps, so the preview equals the total and VAT of the saved line.
function previewAmounts(
  form: FormState,
  isKilometers: boolean,
  reference: ReferenceData,
): { total: number; vat: number } {
  const euros = isKilometers
    ? convertedEuros(form.kilometers, DISTANCE_SCALE, reference.mileageReimbursement)
    : form.currencyId === DOLLAR_ID
      ? convertedEuros(form.amount, STORED_SCALE, reference.dollarsToEuros)
      : roundHalfUp(toDecimal(form.amount), STORED_SCALE);
  return {
    total: toNumber(roundHalfUp(euros, MONEY_SCALE)),
    vat: toNumber(roundHalfUp(multiply(euros, toDecimal(reference.vatRate)), MONEY_SCALE)),
  };
}

function isPositive(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
}

function currencyCode(currency: RefItem): string {
  return CURRENCY_CODES[currency.id] ?? currency.label;
}

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return event.dataTransfer.types.includes('Files');
}

function initialForm(line: LineView | undefined): FormState {
  if (!line) {
    return {
      date: todayIso(),
      typeId: '',
      title: '',
      currencyId: EURO_ID,
      description: '',
      amount: '',
      kilometers: '',
    };
  }
  return {
    date: line.date.slice(0, 10),
    typeId: line.typeId,
    title: line.title,
    currencyId: line.currencyId,
    description: line.description ?? '',
    amount: String(line.amount),
    kilometers: line.kilometers === null ? '' : String(line.kilometers),
  };
}

function validate(
  form: FormState,
  types: RefItem[],
  currencies: RefItem[],
  isKilometers: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  const title = form.title.trim();
  if (title === '') {
    errors.title = MESSAGES.FIELD_REQUIRED;
  } else if (title.length > TITLE_MAX_LENGTH) {
    errors.title = MESSAGES.MAX_LENGTH_50;
  }
  if (form.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = MESSAGES.MAX_LENGTH_1500;
  }
  if (form.date === '' || form.date > todayIso()) {
    errors.date = MESSAGES.DATE_PAST_OR_CURRENT;
  }
  if (!types.some((type) => type.id === form.typeId)) {
    errors.typeId = MESSAGES.FIELD_REQUIRED;
  }
  if (isKilometers) {
    if (!isPositive(form.kilometers)) {
      errors.kilometers = MESSAGES.DISTANCE_POSITIVE;
    }
  } else {
    if (!currencies.some((currency) => currency.id === form.currencyId)) {
      errors.currencyId = MESSAGES.FIELD_REQUIRED;
    }
    if (!isPositive(form.amount)) {
      errors.amount =
        form.currencyId === DOLLAR_ID ? MESSAGES.USD_AMOUNT_ABOVE_ZERO : MESSAGES.MUST_SET_AMOUNT;
    }
  }
  return errors;
}

function toBody(kind: Kind, form: FormState, typeId: number, isKilometers: boolean): LineBody {
  const text = { title: form.title.trim(), description: form.description, date: form.date };
  if (kind === 'earning') {
    const earning: EarningLineBody = {
      earningTypeId: typeId,
      currencyId: form.currencyId,
      amount: Number(form.amount),
      ...text,
    };
    return earning;
  }
  // The server computes a Kilometers line's euro amount from the distance alone.
  const expense: ExpenseLineBody = isKilometers
    ? {
        expenseTypeId: typeId,
        currencyId: EURO_ID,
        amount: null,
        kilometers: Number(form.kilometers),
        ...text,
      }
    : { expenseTypeId: typeId, currencyId: form.currencyId, amount: Number(form.amount), ...text };
  return expense;
}

// A message for an unknown or hidden field has no input to sit under, so the caller shows it elsewhere.
function placeFieldErrors(
  fieldErrors: FieldError[],
  hidden: readonly FieldName[],
): { placed: FieldErrors; unplaced: FieldError[] } {
  const placed: FieldErrors = {};
  const unplaced: FieldError[] = [];
  for (const { field, message } of fieldErrors) {
    const name = Object.hasOwn(SERVER_FIELDS, field) ? SERVER_FIELDS[field] : undefined;
    if (name && !hidden.includes(name)) {
      const current = placed[name];
      placed[name] = current === undefined ? message : `${current}\n${message}`;
    } else {
      unplaced.push({ field, message });
    }
  }
  return { placed, unplaced };
}

export function LineFormDialog({
  open,
  kind,
  report,
  line,
  reference,
  onClose,
  onSaved,
  onStored,
  onConflict,
}: LineFormDialogProps) {
  const feedback = useFeedback();
  const titleId = useId();
  const formId = useId();
  const currencyLabelId = useId();
  const currencyHelperId = useId();
  const uploadLabelId = useId();
  const fileHelperId = useId();
  const dialogFocus = useDialogFocus(open);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  // Set synchronously: a second Save in the same task still reads the previous saving state.
  const inFlight = useRef(false);
  const [form, setForm] = useState<FormState>(() => initialForm(line));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [rejectedSaves, setRejectedSaves] = useState(0);
  // A line stored before its invoice was rejected; later saves update it instead of adding another.
  const [storedLine, setStoredLine] = useState<LineView | undefined>(undefined);
  const target = storedLine ?? line;
  // Entering a child fires its dragenter before the zone's dragleave, so nesting is counted.
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const dropTargetActive = dragOver && !saving;

  useEffect(() => {
    if (open) {
      setForm(initialForm(line));
      setFile(null);
      setErrors({});
      setSaving(false);
      setStoredLine(undefined);
      inFlight.current = false;
      dragDepth.current = 0;
      setDragOver(false);
    }
  }, [open, line]);

  // Saving disables every control and drops focus, so a rejected save refocuses an invalid one or Save.
  useEffect(() => {
    if (rejectedSaves > 0) {
      const invalid = formRef.current?.querySelector<HTMLElement>(FIRST_INVALID_CONTROL);
      if (invalid) {
        invalid.focus();
        // Focus scrolls only the control into view, which can leave its message below the dialog's visible area.
        for (const helperId of invalid.getAttribute('aria-describedby')?.split(/\s+/) ?? []) {
          document.getElementById(helperId)?.scrollIntoView({ block: 'nearest' });
        }
      } else if (!formRef.current?.contains(document.activeElement)) {
        saveButton.current?.focus();
      }
    }
  }, [rejectedSaves]);

  const isExpense = kind === 'expense';
  const isKilometers = isExpense && form.typeId === KILOMETERS_TYPE_ID;
  const types = isExpense ? reference.expenseTypes : reference.earningTypes;
  const typeLabel = isExpense ? 'Expense Type' : 'Earning Type';
  // Inactive types are not offered and the server rejects them, so such a line must pick another type.
  const typeValue = types.some((type) => type.id === form.typeId) ? form.typeId : '';
  const hiddenFields: readonly FieldName[] = isKilometers ? ['currencyId', 'amount'] : ['kilometers'];

  const { total: previewTotal, vat: previewVat } = previewAmounts(form, isKilometers, reference);

  const heading = target
    ? 'Edit Details'
    : `${isExpense ? 'New Expense' : 'New Earning'}: ${form.title}`.trimEnd();

  const clearError = (name: FieldName) =>
    setErrors((prev) => (prev[name] === undefined ? prev : { ...prev, [name]: undefined }));

  const setField = <K extends keyof FormState>(name: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [name]: value }));
    clearError(name);
  };

  const chooseFile = (chosen: File) => {
    setFile(chosen);
    clearError('file');
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    if (chosen) {
      chooseFile(chosen);
    }
    // Lets the same file be picked again after it was replaced or rejected.
    event.target.value = '';
  };

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (carriesFiles(event)) {
      dragDepth.current += 1;
      setDragOver(true);
    }
  };

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const accepted = carriesFiles(event) && !saving;
    event.dataTransfer.dropEffect = accepted ? 'copy' : 'none';
    if (accepted) {
      setDragOver(true);
    }
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (carriesFiles(event)) {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) {
        setDragOver(false);
      }
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped && !saving) {
      chooseFile(dropped);
    }
  };

  // ButtonBase turns Enter and Space on a label into onClick calls, which the label never forwards to its input.
  const handleBrowseClick = (event: MouseEvent<HTMLLabelElement>) => {
    if (event.type !== 'click') {
      fileInput.current?.click();
    }
  };

  const showFailure = (err: unknown, fallbackField?: FieldName) => {
    const fieldErrors = err instanceof ApiError ? (err.fieldErrors ?? []) : [];
    setRejectedSaves((count) => count + 1);
    if (fieldErrors.length === 0) {
      if (fallbackField) {
        setErrors({ [fallbackField]: err instanceof ApiError ? err.message : MESSAGES.GENERIC_ERROR });
      } else {
        feedback.error(err);
      }
      return;
    }
    const { placed, unplaced } = placeFieldErrors(fieldErrors, hiddenFields);
    setErrors(placed);
    if (err instanceof ApiError && unplaced.length > 0) {
      feedback.error(new ApiError(err.status, err.code, err.message, unplaced));
    }
  };

  // A 409 means the report left Draft in another session, so no retry here can succeed.
  const closeOnConflict = (err: unknown): boolean => {
    if (!(err instanceof ApiError && err.status === 409)) {
      return false;
    }
    feedback.error(err);
    onConflict();
    return true;
  };

  const save = async () => {
    const clientErrors = validate(form, types, reference.currencies, isKilometers);
    setErrors(clientErrors);
    const typeId = form.typeId;
    if (Object.keys(clientErrors).length > 0 || typeId === '') {
      setRejectedSaves((count) => count + 1);
      return;
    }
    const body = toBody(kind, form, typeId, isKilometers);
    // Cleared only when the dialog stays open; a closing dialog is reset by its next open.
    inFlight.current = true;
    setSaving(true);
    let saved: LineView;
    try {
      saved = target ? await updateLine(kind, target.id, body) : await createLine(kind, report.id, body);
    } catch (err) {
      if (closeOnConflict(err)) {
        return;
      }
      inFlight.current = false;
      setSaving(false);
      showFailure(err);
      return;
    }
    let savedMessage: string;
    if (target) {
      savedMessage = isExpense
        ? 'Your expense detail was successfully edited'
        : 'Your earning detail was successfully edited';
    } else {
      savedMessage = isExpense ? 'Expense was added' : 'Earning was added';
    }
    if (file) {
      try {
        await uploadInvoice(kind, saved.id, file);
      } catch (err) {
        if (closeOnConflict(err)) {
          return;
        }
        // The line itself was stored, so the parent reloads while the dialog stays on it to retry the upload.
        onStored(saved);
        setStoredLine(saved);
        inFlight.current = false;
        setSaving(false);
        feedback.success(savedMessage);
        showFailure(err, 'file');
        return;
      }
    }
    feedback.success(savedMessage);
    onSaved(saved);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inFlight.current) {
      void save();
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
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        sx={{ paddingInlineEnd: 2 }}
      >
        <DialogTitle id={titleId} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          {heading}
        </DialogTitle>
        <IconButton
          aria-label="Close"
          color="primary"
          onClick={onClose}
          disabled={saving}
          sx={{ flexShrink: 0 }}
        >
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent sx={{ scrollPaddingBlock: (theme) => theme.spacing(1) }}>
        <Box component="form" ref={formRef} id={formId} noValidate onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                type="date"
                name="date"
                label="Date"
                fullWidth
                disabled={saving}
                value={form.date}
                onChange={(event) => setField('date', event.target.value)}
                error={Boolean(errors.date)}
                helperText={errors.date}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { max: todayIso() },
                  formHelperText: { sx: MULTILINE_HELPER_SX },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                name={isExpense ? 'expenseTypeId' : 'earningTypeId'}
                label={typeLabel}
                fullWidth
                disabled={saving}
                value={typeValue}
                onChange={(event) => setField('typeId', Number(event.target.value))}
                error={Boolean(errors.typeId)}
                helperText={errors.typeId}
                slots={{ inputLabel: SelectLabel }}
                slotProps={{ formHelperText: { sx: MULTILINE_HELPER_SX } }}
              >
                {types.map((type) => (
                  <MenuItem key={type.id} value={type.id}>
                    {type.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                required
                name="title"
                label="Title"
                fullWidth
                disabled={saving}
                value={form.title}
                onChange={(event) => setField('title', event.target.value)}
                error={Boolean(errors.title)}
                helperText={errors.title}
                slotProps={{ formHelperText: { sx: MULTILINE_HELPER_SX } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {isKilometers ? (
                <TextField
                  type="number"
                  name="kilometers"
                  label="Distance"
                  fullWidth
                  disabled={saving}
                  value={form.kilometers}
                  onChange={(event) => setField('kilometers', event.target.value)}
                  error={Boolean(errors.kilometers)}
                  helperText={errors.kilometers}
                  slotProps={{
                    input: { endAdornment: <InputAdornment position="end">km</InputAdornment> },
                    htmlInput: { step: 'any', inputMode: 'decimal' },
                    formHelperText: { sx: MULTILINE_HELPER_SX },
                  }}
                />
              ) : (
                <Stack spacing={1}>
                  <FormLabel id={currencyLabelId} component="span">
                    Currency
                  </FormLabel>
                  <ToggleButtonGroup
                    exclusive
                    fullWidth
                    size="small"
                    color="primary"
                    disabled={saving}
                    value={form.currencyId}
                    onChange={(_event, value: number | null) => {
                      if (value !== null) {
                        setField('currencyId', value);
                      }
                    }}
                    aria-labelledby={currencyLabelId}
                    aria-describedby={errors.currencyId ? currencyHelperId : undefined}
                  >
                    {/* The group cannot take focus, so the buttons carry the invalid state. */}
                    {reference.currencies.map((currency) => (
                      <ToggleButton
                        key={currency.id}
                        value={currency.id}
                        aria-describedby={errors.currencyId ? currencyHelperId : undefined}
                        aria-invalid={errors.currencyId ? true : undefined}
                      >
                        {currencyCode(currency)}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  {errors.currencyId && (
                    <FormHelperText id={currencyHelperId} error sx={MULTILINE_HELPER_SX}>
                      {errors.currencyId}
                    </FormHelperText>
                  )}
                </Stack>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField
                multiline
                minRows={3}
                name="description"
                label="Description"
                fullWidth
                disabled={saving}
                value={form.description}
                onChange={(event) => setField('description', event.target.value)}
                error={Boolean(errors.description)}
                helperText={errors.description}
                slotProps={{ formHelperText: { sx: MULTILINE_HELPER_SX } }}
              />
            </Grid>
            {!isKilometers && (
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  type="number"
                  name="amount"
                  label="Amount"
                  fullWidth
                  disabled={saving}
                  value={form.amount}
                  onChange={(event) => setField('amount', event.target.value)}
                  error={Boolean(errors.amount)}
                  helperText={errors.amount}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          {form.currencyId === DOLLAR_ID ? '$' : '€'}
                        </InputAdornment>
                      ),
                    },
                    htmlInput: { step: 'any', inputMode: 'decimal' },
                    formHelperText: { sx: MULTILINE_HELPER_SX },
                  }}
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={1}>
                <FormLabel id={uploadLabelId} component="span">
                  Upload Invoice
                </FormLabel>
                <Box
                  role="group"
                  aria-labelledby={uploadLabelId}
                  aria-describedby={errors.file ? fileHelperId : undefined}
                  aria-disabled={saving ? true : undefined}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  sx={{
                    border: 1,
                    borderStyle: dropTargetActive ? 'solid' : 'dashed',
                    borderColor: dropTargetActive ? 'primary.main' : errors.file ? 'error.main' : 'divider',
                    bgcolor: dropTargetActive ? 'action.hover' : undefined,
                    borderRadius: 1,
                    p: 2,
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <UploadIcon color={saving ? 'disabled' : 'action'} />
                      <Typography variant="body2" color={saving ? 'text.disabled' : undefined}>
                        Drop a file here or
                      </Typography>
                      <Button
                        component="label"
                        variant="text"
                        size="small"
                        disabled={saving}
                        onClick={handleBrowseClick}
                        aria-describedby={errors.file ? fileHelperId : undefined}
                        aria-invalid={errors.file ? true : undefined}
                      >
                        browse
                        {/* The one native input: MUI has no file picker, so this label opens it. */}
                        <input
                          ref={fileInput}
                          type="file"
                          name="file"
                          hidden
                          accept={ACCEPTED_INVOICE_TYPES}
                          onChange={handleFileInput}
                        />
                      </Button>
                    </Stack>
                    {file ? (
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {`Selected file: ${file.name}`}
                      </Typography>
                    ) : (
                      target?.invoice && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ overflowWrap: 'anywhere' }}
                        >
                          {`Current invoice: ${target.invoice.filename}. A new file replaces it.`}
                        </Typography>
                      )
                    )}
                  </Stack>
                </Box>
                {errors.file && (
                  <FormHelperText id={fileHelperId} error sx={MULTILINE_HELPER_SX}>
                    {errors.file}
                  </FormHelperText>
                )}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {/* For a Kilometers line this total is the reimbursement value, so it is not shown twice. */}
              <Stack spacing={1} sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2 }}>
                <Typography variant="body2">Total:</Typography>
                <Typography
                  variant="h4"
                  component="p"
                  aria-live="polite"
                  sx={{ fontWeight: 'fontWeightBold', overflowWrap: 'anywhere' }}
                >
                  {formatEuro(previewTotal)}
                </Typography>
                <Typography variant="body2">
                  {`${vatLabel(reference.vatRate)}: ${formatEuro(previewVat)}`}
                </Typography>
              </Stack>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Stack direction="row" spacing={1} sx={{ flexGrow: 1, paddingInline: 2, paddingBlockEnd: 2 }}>
          <Button ref={saveButton} type="submit" form={formId} variant="contained" loading={saving}>
            Save
          </Button>
          <Button variant="outlined" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

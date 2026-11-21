import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, InputAdornment, Stack, TextField } from '@mui/material';
import { reference, usdToEur } from '../api/api';
import { ApiError, MESSAGES, type FieldError, type UsdToEurResult } from '../api/types';
import { useFeedback } from '../components/Feedback';
import { PageHeader } from '../layout/PageHeader';

type ConverterField = 'amount' | 'rate';
type FieldErrors = Record<ConverterField, string>;

const NO_ERRORS: FieldErrors = { amount: '', rate: '' };

const BREADCRUMBS = [{ label: 'Home', to: '/' }, { label: 'USD to EUR Converter' }];

function isPositiveNumber(value: string): boolean {
  if (value.trim() === '') {
    return false;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function isConverterField(field: string): field is ConverterField {
  return field === 'amount' || field === 'rate';
}

export function UsdToEurConverterPage() {
  const feedback = useFeedback();
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [result, setResult] = useState<UsdToEurResult | null>(null);
  const [convertedAmount, setConvertedAmount] = useState('');
  const [converting, setConverting] = useState(false);
  const rateEdited = useRef(false);

  useEffect(() => {
    let active = true;
    reference()
      .then((ref) => {
        if (active && !rateEdited.current) {
          setRate(String(ref.dollarsToEuros));
        }
      })
      .catch((err: unknown) => {
        if (active) {
          feedback.error(err);
        }
      });
    return () => {
      active = false;
    };
  }, [feedback]);

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAmount(event.target.value);
    setErrors((prev) => ({ ...prev, amount: '' }));
  };

  const handleRateChange = (event: ChangeEvent<HTMLInputElement>) => {
    rateEdited.current = true;
    setRate(event.target.value);
    setErrors((prev) => ({ ...prev, rate: '' }));
  };

  const handleConvert = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (converting) {
      return;
    }
    const nextErrors: FieldErrors = {
      amount: isPositiveNumber(amount) ? '' : MESSAGES.USD_AMOUNT_ABOVE_ZERO,
      rate: isPositiveNumber(rate) ? '' : MESSAGES.RATE_ABOVE_ZERO,
    };
    setErrors(nextErrors);
    setResult(null);
    if (nextErrors.amount !== '' || nextErrors.rate !== '') {
      return;
    }

    const usd = Number(amount);
    setConverting(true);
    try {
      const converted = await usdToEur(usd, Number(rate));
      setConvertedAmount(String(usd));
      setResult(converted);
    } catch (err) {
      const serverErrors: FieldErrors = { ...NO_ERRORS };
      let unplaced: ApiError | null = null;
      if (err instanceof ApiError) {
        const otherErrors: FieldError[] = [];
        for (const fieldError of err.fieldErrors ?? []) {
          if (isConverterField(fieldError.field)) {
            const current = serverErrors[fieldError.field];
            serverErrors[fieldError.field] =
              current === '' ? fieldError.message : `${current}\n${fieldError.message}`;
          } else {
            otherErrors.push(fieldError);
          }
        }
        if (otherErrors.length > 0) {
          unplaced = new ApiError(err.status, err.code, err.message, otherErrors);
        }
      }
      if (serverErrors.amount !== '' || serverErrors.rate !== '') {
        setErrors(serverErrors);
        if (unplaced) {
          feedback.error(unplaced);
        }
      } else {
        feedback.error(err);
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <>
      <PageHeader title="USD/EUR Currency Converter" breadcrumbs={BREADCRUMBS} />
      <Card sx={{ maxWidth: 'sm' }}>
        <CardContent>
          <Box component="form" noValidate onSubmit={handleConvert}>
            <Stack spacing={2}>
              <TextField
                label="USD Amount"
                type="number"
                value={amount}
                onChange={handleAmountChange}
                error={errors.amount !== ''}
                helperText={errors.amount || undefined}
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">$</InputAdornment> },
                  htmlInput: { step: 'any' },
                  formHelperText: { sx: { whiteSpace: 'pre-line' } },
                }}
              />
              <TextField
                label="Exchange Rate USD/EUR"
                type="number"
                value={rate}
                onChange={handleRateChange}
                error={errors.rate !== ''}
                helperText={errors.rate || undefined}
                slotProps={{
                  htmlInput: { step: 'any' },
                  formHelperText: { sx: { whiteSpace: 'pre-line' } },
                }}
              />
              <Button type="submit" variant="contained" loading={converting} sx={{ alignSelf: 'flex-start' }}>
                Convert
              </Button>
              {result && (
                <Alert severity="success" role="status">
                  {`${convertedAmount}$ using exchange rate of ${String(result.rate)} equals to ${String(result.eur)}€`}
                </Alert>
              )}
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}

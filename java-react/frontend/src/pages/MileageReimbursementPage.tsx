import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Box, Button, Card, CardContent, InputAdornment, Stack, TextField } from '@mui/material';
import { mileage } from '../api/api';
import { ApiError, MESSAGES, type MileageResult } from '../api/types';
import { useFeedback } from '../components/Feedback';
import { formatEuro } from '../format/format';
import { PageHeader } from '../layout/PageHeader';

const KM_FIELD = 'km';

function parseDistance(raw: string): number | null {
  if (raw.trim() === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function MileageReimbursementPage() {
  const feedback = useFeedback();
  const [km, setKm] = useState('');
  const [result, setResult] = useState<MileageResult | null>(null);
  const [error, setError] = useState('');
  const [converting, setConverting] = useState(false);
  const latestRequest = useRef(0);

  const handleKmChange = (event: ChangeEvent<HTMLInputElement>) => {
    latestRequest.current += 1;
    setKm(event.target.value);
    setResult(null);
    setError('');
    setConverting(false);
  };

  const convert = async (distance: number) => {
    latestRequest.current += 1;
    const requestId = latestRequest.current;
    setError('');
    setConverting(true);
    try {
      const converted = await mileage(distance);
      if (requestId === latestRequest.current) {
        setResult(converted);
      }
    } catch (err) {
      if (requestId === latestRequest.current) {
        const fieldError =
          err instanceof ApiError ? err.fieldErrors?.find((f) => f.field === KM_FIELD) : undefined;
        if (fieldError) {
          setError(fieldError.message);
        } else {
          feedback.error(err);
        }
      }
    } finally {
      if (requestId === latestRequest.current) {
        setConverting(false);
      }
    }
  };

  const handleConvert = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const distance = parseDistance(km);
    if (distance === null) {
      setResult(null);
      setError(MESSAGES.DISTANCE_POSITIVE);
      return;
    }
    void convert(distance);
  };

  return (
    <>
      <PageHeader title="Mileage Reimbursement" />
      <Card sx={{ maxWidth: 'sm' }}>
        <CardContent>
          <Box component="form" noValidate onSubmit={handleConvert}>
            <Stack spacing={2} alignItems="flex-start">
              <TextField
                label="Mileage"
                type="number"
                name={KM_FIELD}
                value={km}
                onChange={handleKmChange}
                error={error !== ''}
                helperText={error || undefined}
                fullWidth
                slotProps={{
                  input: { endAdornment: <InputAdornment position="end">km</InputAdornment> },
                  htmlInput: { min: 0, step: 'any' },
                }}
              />
              <TextField
                label="Result in EUR"
                value={result ? formatEuro(result.eur) : ''}
                fullWidth
                slotProps={{ input: { readOnly: true } }}
              />
              <Button type="submit" variant="contained" loading={converting}>
                Convert
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </>
  );
}

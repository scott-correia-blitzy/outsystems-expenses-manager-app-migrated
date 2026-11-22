import { Chip, type ChipProps } from '@mui/material';
import type { StatusLabel } from '../api/types';

const COLOURS: Record<StatusLabel, ChipProps['color']> = {
  Draft: 'default',
  Submitted: 'info',
  Approved: 'success',
  Declined: 'error',
};

export function StatusTag({ status }: { status: StatusLabel }) {
  return (
    // Outlined keeps the legacy light pill and sets it apart from the filled report-code chip.
    <Chip label={status} color={COLOURS[status]} size="small" variant="outlined" component="span" />
  );
}

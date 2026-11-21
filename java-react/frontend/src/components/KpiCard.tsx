import { useId, type ReactNode } from 'react';
import { Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';

export type KpiCardProps = {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  progress?: number;
};

export function KpiCard({ label, value, caption, progress }: KpiCardProps) {
  const labelId = useId();
  const progressValue =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : undefined;
  const hasCaption = caption != null && caption !== false && caption !== '';

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={1}>
          <Typography id={labelId} variant="subtitle1" component="p">
            {label}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 'fontWeightBold' }}>
            {value}
          </Typography>
          {progressValue !== undefined && (
            <LinearProgress
              variant="determinate"
              value={progressValue}
              aria-labelledby={labelId}
              // MUI rounds aria-valuenow, so announce the figure as displayed.
              aria-valuetext={typeof value === 'string' ? value : undefined}
            />
          )}
          {hasCaption && (
            // A div, not a p: callers pass their own Typography as the caption.
            <Typography variant="body2" color="text.secondary" component="div">
              {caption}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

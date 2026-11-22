import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  type Theme,
} from '@mui/material';
import { adminDashboard } from '../api/api';
import { ApiError, MESSAGES, type AdminDashboard, type Kind } from '../api/types';
import { LiveStatus, useFeedback } from '../components/Feedback';
import { KpiCard } from '../components/KpiCard';
import { ReportList } from '../components/ReportList';
import { formatPercent } from '../format/format';
import { PageHeader } from '../layout/PageHeader';

const COUNTER_SIZE = { xs: 12, sm: 6, lg: 3 } as const;
const RATE_SIZE = { xs: 12, lg: 6 } as const;

const KIND_OPTIONS: readonly { value: Kind; label: string }[] = [
  { value: 'expense', label: 'Expenses' },
  { value: 'earning', label: 'Earnings' },
];

const KIND_BUTTON_SX = {
  minInlineSize: (theme: Theme) => ({ xs: 0, sm: theme.spacing(20) }),
} as const;

function Counters({ counters }: { counters: AdminDashboard }) {
  return (
    <Grid container spacing={2}>
      <Grid size={COUNTER_SIZE}>
        <KpiCard label="Total Reports" value={String(counters.totalReports)} />
      </Grid>
      <Grid size={COUNTER_SIZE}>
        <KpiCard label="Reports Waiting Verification" value={String(counters.waiting)} />
      </Grid>
      <Grid size={RATE_SIZE}>
        <KpiCard
          label="Approved Report Rate"
          value={formatPercent(counters.approvedRate)}
          progress={counters.approvedRate}
        />
      </Grid>
    </Grid>
  );
}

const PLACEHOLDER_COUNTERS: AdminDashboard = { totalReports: 0, waiting: 0, approvedRate: 0 };

// Hidden real cards hold the row's final height at every breakpoint, so nothing below moves on arrival.
function CountersPlaceholder() {
  return (
    <Box sx={{ position: 'relative' }}>
      <Box aria-hidden sx={{ visibility: 'hidden' }}>
        <Counters counters={PLACEHOLDER_COUNTERS} />
      </Box>
      <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0 }}>
        <CircularProgress aria-label="Loading report counters" />
      </Stack>
    </Box>
  );
}

function counterSummary(counters: AdminDashboard): string {
  return [
    `Total Reports ${counters.totalReports}`,
    `Reports Waiting Verification ${counters.waiting}`,
    `Approved Report Rate ${formatPercent(counters.approvedRate)}`,
  ].join(', ');
}

export function AdminDashboardPage() {
  const feedback = useFeedback();
  const [counters, setCounters] = useState<AdminDashboard | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  // Only the newest request may update state; bumping it on unmount drops every pending one.
  const latestRequest = useRef(0);

  const reloadCounters = useCallback(() => {
    const request = ++latestRequest.current;
    // Cleared first so an unchanged summary is still announced after a decision.
    setAnnouncement('');
    adminDashboard()
      .then((data) => {
        if (request === latestRequest.current) {
          setCounters(data);
          setLoadError(null);
          setAnnouncement(counterSummary(data));
        }
      })
      .catch((err: unknown) => {
        if (request === latestRequest.current) {
          setLoadError(err instanceof ApiError ? err.message : MESSAGES.GENERIC_ERROR);
          feedback.error(err);
        }
      })
      .finally(() => {
        if (request === latestRequest.current) {
          setLoading(false);
        }
      });
  }, [feedback]);

  useEffect(() => {
    reloadCounters();
    return () => {
      latestRequest.current += 1;
    };
  }, [reloadCounters]);

  const retryCounters = () => {
    setLoadError(null);
    setLoading(true);
    reloadCounters();
  };

  const changeKind = (_event: MouseEvent<HTMLElement>, next: Kind | null) => {
    if (next !== null) {
      setKind(next);
    }
  };

  // Once counters have loaded they stay on screen; a failed refresh only raises the toast.
  let counterArea: ReactNode = null;
  if (counters) {
    counterArea = <Counters counters={counters} />;
  } else if (loading) {
    counterArea = <CountersPlaceholder />;
  } else if (loadError !== null) {
    counterArea = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={retryCounters}>
            Retry
          </Button>
        }
      >
        {loadError}
      </Alert>
    );
  }

  return (
    <>
      <PageHeader
        title="Administrator Dashboard"
        subtitle="Welcome to Expenses Manager"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]}
      />
      <LiveStatus message={announcement} />
      {/* Keeps the footer below the fold until the counters arrive. */}
      <Stack spacing={3} useFlexGap sx={{ minHeight: loading ? '100vh' : undefined }}>
        {counterArea}
        <Divider />
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={kind}
          onChange={changeKind}
          aria-label="Report type"
          sx={{ alignSelf: 'flex-start', maxInlineSize: '100%' }}
        >
          {KIND_OPTIONS.map((option) => (
            <ToggleButton key={option.value} value={option.value} sx={KIND_BUTTON_SX}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ReportList mode="admin" kind={kind} onDecided={reloadCounters} />
      </Stack>
    </>
  );
}

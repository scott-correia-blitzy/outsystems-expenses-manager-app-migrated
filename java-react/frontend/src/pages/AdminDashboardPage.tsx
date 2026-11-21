import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  CircularProgress,
  Divider,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  type Theme,
} from '@mui/material';
import { adminDashboard } from '../api/api';
import type { AdminDashboard, Kind } from '../api/types';
import { useFeedback } from '../components/Feedback';
import { KpiCard } from '../components/KpiCard';
import { ReportList } from '../components/ReportList';
import { formatPercent } from '../format/format';
import { PageHeader } from '../layout/PageHeader';

const COUNTER_SIZE = { xs: 12, sm: 6, md: 3 } as const;
const RATE_SIZE = { xs: 12, md: 6 } as const;

const KIND_OPTIONS: readonly { value: Kind; label: string }[] = [
  { value: 'expense', label: 'Expenses' },
  { value: 'earning', label: 'Earnings' },
];

const KIND_BUTTON_SX = { minInlineSize: (theme: Theme) => theme.spacing(20) } as const;

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

export function AdminDashboardPage() {
  const feedback = useFeedback();
  const [counters, setCounters] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<Kind>('expense');
  // Only the newest request may update state; bumping it on unmount drops every pending one.
  const latestRequest = useRef(0);

  const reloadCounters = useCallback(() => {
    const request = ++latestRequest.current;
    adminDashboard()
      .then((data) => {
        if (request === latestRequest.current) {
          setCounters(data);
        }
      })
      .catch((err: unknown) => {
        if (request === latestRequest.current) {
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

  const changeKind = (_event: MouseEvent<HTMLElement>, next: Kind | null) => {
    if (next !== null) {
      setKind(next);
    }
  };

  let counterArea: ReactNode = null;
  if (counters) {
    counterArea = <Counters counters={counters} />;
  } else if (loading) {
    counterArea = (
      <Stack alignItems="center" sx={{ paddingBlock: 4 }}>
        <CircularProgress aria-label="Loading report counters" />
      </Stack>
    );
  }

  return (
    <>
      <PageHeader
        title="Administrator Dashboard"
        subtitle="Welcome to Expenses Manager"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]}
      />
      <Stack spacing={3} useFlexGap>
        {counterArea}
        <Divider />
        <ToggleButtonGroup
          exclusive
          color="primary"
          value={kind}
          onChange={changeKind}
          aria-label="Report type"
          sx={{ alignSelf: 'flex-start' }}
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

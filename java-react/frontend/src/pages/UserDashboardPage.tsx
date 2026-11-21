import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  type ChipProps,
} from '@mui/material';
import { userDashboard } from '../api/api';
import type { DatedAmount, Kind, StatusCounts, TypeShare, UserDashboard } from '../api/types';
import { useFeedback } from '../components/Feedback';
import { KpiCard } from '../components/KpiCard';
import {
  formatEuro,
  formatPercent,
  formatPeriodRange,
  formatRowDate,
  formatSignedEuro,
} from '../format/format';
import { PageHeader } from '../layout/PageHeader';
import { PATHS } from '../routes';

type EarningShare = UserDashboard['earningTypeShares'][number];

const KPI_SIZE = { xs: 12, sm: 6, md: 3 } as const;
const WIDE_SIZE = { xs: 12, md: 8 } as const;
const NARROW_SIZE = { xs: 12, md: 4 } as const;

const SERIES: Record<Kind, { label: string; color: string }> = {
  expense: { label: 'Expenses', color: 'error.main' },
  earning: { label: 'Earnings', color: 'success.main' },
};

const STATUS_ROWS: readonly { label: string; key: keyof StatusCounts; color: ChipProps['color'] }[] = [
  { label: 'Approved', key: 'approved', color: 'success' },
  { label: 'Declined', key: 'declined', color: 'error' },
  { label: 'Submitted', key: 'submitted', color: 'info' },
  { label: 'Draft', key: 'draft', color: 'default' },
];

// Legacy wording, grammar included, kept verbatim.
const DRAFT_BANNER = 'You have reports with Draft status, this reports are not considered for statistics';
const BELOW_LAST_MONTH = 'less of last month';
const ABOVE_LAST_MONTH = 'above of last month';

function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;
}

function Signal({ positive, children }: { positive: boolean; children: ReactNode }) {
  return (
    <Typography
      variant="body2"
      sx={{ color: positive ? 'success.main' : 'error.main', fontWeight: 'fontWeightBold' }}
    >
      {children}
    </Typography>
  );
}

function LabelWithNote({ label, note }: { label: string; note: string }) {
  return (
    <>
      {label}{' '}
      <Typography component="span" variant="body2">
        {note}
      </Typography>
    </>
  );
}

function MonthChangeCaption({ percent }: { percent: number | null }) {
  if (percent == null) {
    return null;
  }
  const belowLastMonth = percent > 0;
  return (
    <Signal positive={belowLastMonth}>
      is {formatPercent(Math.abs(percent))} {belowLastMonth ? BELOW_LAST_MONTH : ABOVE_LAST_MONTH}
    </Signal>
  );
}

function DashboardSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card component="section" aria-labelledby={titleId} sx={{ height: '100%' }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography id={titleId} variant="h6" component="h2">
            {note ? <LabelWithNote label={title} note={note} /> : title}
          </Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

function PerDateChart({ points }: { points: DatedAmount[] }) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const largest = Math.max(0, ...sorted.map((point) => point.amountInEuros));

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 0.5,
          height: (theme) => theme.spacing(25),
          borderBlockEnd: (theme) => `1px solid ${theme.palette.divider}`,
        }}
      >
        {sorted.map((point, index) => {
          const series = SERIES[point.kind];
          // Names the series so the bar's meaning never rests on its colour alone.
          const text = `${series.label} on ${formatRowDate(point.date)}: ${formatEuro(point.amountInEuros)}`;
          return (
            <Tooltip key={`${point.kind}-${point.date}-${index}`} title={text}>
              <Box
                role="img"
                aria-label={text}
                tabIndex={0}
                sx={{
                  flex: 1,
                  maxWidth: (theme) => theme.spacing(6),
                  minHeight: (theme) => theme.spacing(0.5),
                  height: `${percentOf(point.amountInEuros, largest)}%`,
                  bgcolor: series.color,
                }}
              />
            </Tooltip>
          );
        })}
      </Box>
      <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
        {(Object.keys(SERIES) as Kind[]).map((kind) => (
          <Stack key={kind} direction="row" spacing={1} alignItems="center">
            <Box
              aria-hidden
              sx={{
                width: (theme) => theme.spacing(1.5),
                height: (theme) => theme.spacing(1.5),
                bgcolor: SERIES[kind].color,
              }}
            />
            <Typography variant="body2">{SERIES[kind].label}</Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

function ExpensesPerType({ shares }: { shares: TypeShare[] }) {
  return (
    <List
      aria-label="Expenses per type"
      tabIndex={0}
      disablePadding
      // Tall enough for the four expense types; any further type scrolls.
      sx={{ maxHeight: (theme) => theme.spacing(40), overflow: 'auto' }}
    >
      {shares.map((share, index) => (
        <ListItem key={share.typeId} divider={index < shares.length - 1} sx={{ gap: 2 }}>
          <ListItemText primary={share.label} secondary={`Count: ${share.count}`} />
          <Stack alignItems="flex-end" sx={{ flexShrink: 0, textAlign: 'end' }}>
            <Typography variant="body2" sx={{ fontWeight: 'fontWeightBold' }}>
              {formatPercent(share.sharePercent)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatEuro(share.sum)}
            </Typography>
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}

function EarningsTrends({ shares }: { shares: EarningShare[] }) {
  const total = shares.reduce((sum, share) => sum + Math.max(0, share.sum), 0);

  return (
    <Stack spacing={2}>
      {shares.map((share) => (
        <Stack key={share.typeId} spacing={0.5}>
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body1">{share.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'fontWeightBold' }}>
              {formatEuro(share.sum)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={percentOf(share.sum, total)}
            aria-label={share.label}
            aria-valuetext={formatEuro(share.sum)}
          />
        </Stack>
      ))}
    </Stack>
  );
}

function ReportStatusSummary({ counts }: { counts: StatusCounts }) {
  return (
    <List disablePadding aria-label="Report Status Summary">
      {STATUS_ROWS.map((row, index) => (
        <ListItem key={row.key} divider={index < STATUS_ROWS.length - 1} sx={{ gap: 2 }}>
          <ListItemText primary={row.label} />
          <Chip size="small" color={row.color} label={counts[row.key]} />
        </ListItem>
      ))}
    </List>
  );
}

function DashboardContent({ dashboard }: { dashboard: UserDashboard }) {
  const balanceOk = dashboard.balance >= 0;

  return (
    <Stack spacing={2}>
      {dashboard.draftBanner && (
        <Alert severity="info" variant="filled">
          {DRAFT_BANNER}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={KPI_SIZE}>
          <KpiCard
            label="Total Balance"
            value={formatEuro(dashboard.balance)}
            caption={
              <Signal positive={balanceOk}>
                {balanceOk ? 'Your balance is ok' : 'Your balance is in debt'}
              </Signal>
            }
          />
        </Grid>
        <Grid size={KPI_SIZE}>
          <KpiCard
            label={<LabelWithNote label="Total Spent" note="(current month)" />}
            value={formatEuro(dashboard.currentMonthSpent)}
            caption={<MonthChangeCaption percent={dashboard.monthChangePercent} />}
          />
        </Grid>
        <Grid size={KPI_SIZE}>
          <KpiCard
            label={<LabelWithNote label="Total Spent" note="(last month)" />}
            value={formatEuro(dashboard.lastMonthSpent)}
            caption={formatPeriodRange(dashboard.lastMonth.from, dashboard.lastMonth.to)}
          />
        </Grid>
        <Grid size={KPI_SIZE}>
          <KpiCard
            label={<LabelWithNote label="Earnings" note="(current month)" />}
            value={formatSignedEuro(dashboard.currentMonthEarnings)}
            caption={formatPeriodRange(dashboard.currentMonth.from, dashboard.currentMonth.to)}
          />
        </Grid>
        <Grid size={WIDE_SIZE}>
          <DashboardSection title="Expenses & Earnings per date" note="(last 30 days)">
            <PerDateChart points={dashboard.perDate} />
          </DashboardSection>
        </Grid>
        <Grid size={NARROW_SIZE}>
          <DashboardSection title="Expenses per type">
            <ExpensesPerType shares={dashboard.expenseTypeShares} />
          </DashboardSection>
        </Grid>
        <Grid size={WIDE_SIZE}>
          <DashboardSection title="Earnings trends">
            <EarningsTrends shares={dashboard.earningTypeShares} />
          </DashboardSection>
        </Grid>
        <Grid size={NARROW_SIZE}>
          <DashboardSection title="Report Status Summary">
            <ReportStatusSummary counts={dashboard.statusCounts} />
          </DashboardSection>
        </Grid>
      </Grid>
    </Stack>
  );
}

export function UserDashboardPage() {
  const feedback = useFeedback();
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    userDashboard()
      .then((data) => {
        if (active) {
          setDashboard(data);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          feedback.error(err);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [feedback]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome to Expenses Manager"
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]}
        actions={
          <Button variant="contained" component={RouterLink} to={PATHS.reports}>
            View Reports
          </Button>
        }
      />
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', paddingBlock: 8 }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      )}
      {dashboard && <DashboardContent dashboard={dashboard} />}
    </>
  );
}

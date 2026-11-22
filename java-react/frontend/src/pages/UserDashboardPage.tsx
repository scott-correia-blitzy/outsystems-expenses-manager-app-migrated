import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
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
  linearProgressClasses,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  type ChipProps,
} from '@mui/material';
import { darken, type PaletteColor, type Theme } from '@mui/material/styles';
import { userDashboard } from '../api/api';
import {
  ApiError,
  MESSAGES,
  type DatedAmount,
  type Kind,
  type StatusCounts,
  type TypeShare,
  type UserDashboard,
} from '../api/types';
import { LiveStatus, useFeedback } from '../components/Feedback';
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

const KPI_SIZE = { xs: 12, sm: 6, lg: 3 } as const;
const WIDE_SIZE = { xs: 12, md: 8 } as const;
const NARROW_SIZE = { xs: 12, md: 4 } as const;

const SERIES: Record<Kind, { label: string; palette: 'error' | 'success' }> = {
  expense: { label: 'Expenses', palette: 'error' },
  earning: { label: 'Earnings', palette: 'success' },
};
const SERIES_KINDS = Object.keys(SERIES) as Kind[];

// Keyed by typeId so each earning type keeps its tone whatever order the rows arrive in.
const EARNING_TONES: readonly ((tones: PaletteColor) => string)[] = [
  (tones) => tones.main,
  (tones) => tones.dark,
  (tones) => tones.light,
  (tones) => darken(tones.dark, 0.4),
];

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

function seriesColor(kind: Kind): string {
  return `${SERIES[kind].palette}.main`;
}

function byDateThenSeries(a: DatedAmount, b: DatedAmount): number {
  return a.date.localeCompare(b.date) || SERIES_KINDS.indexOf(a.kind) - SERIES_KINDS.indexOf(b.kind);
}

function earningTone(theme: Theme, typeId: number): string {
  const count = EARNING_TONES.length;
  return EARNING_TONES[(((typeId - 1) % count) + count) % count](theme.palette[SERIES.earning.palette]);
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

const FOCUS_VISIBLE_SX = {
  '&:focus-visible': {
    outline: 2,
    outlineColor: 'primary.main',
    outlineOffset: (theme: Theme) => theme.spacing(0.25),
  },
} as const;

function NoData({ children }: { children: string }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

function PerDateChart({ points }: { points: DatedAmount[] }) {
  if (points.length === 0) {
    return <NoData>No expenses or earnings in the last 30 days</NoData>;
  }
  const columns = new Map<string, DatedAmount[]>();
  for (const point of [...points].sort(byDateThenSeries)) {
    const column = columns.get(point.date);
    if (column) {
      column.push(point);
    } else {
      columns.set(point.date, [point]);
    }
  }
  // A spread argument list overflows the engine limit on long series.
  const largest = points.reduce((max, point) => Math.max(max, point.amountInEuros), 0);

  return (
    <Stack spacing={2}>
      {/* Scrolls inside the card once the dates outgrow it; the top padding keeps focus outlines unclipped. */}
      <Box sx={{ overflowX: 'auto', pt: 0.5 }}>
        <Stack direction="row">
          {[...columns].map(([date, column]) => (
            <Stack
              key={date}
              spacing={0.5}
              sx={{ flex: '1 1 0', minWidth: (theme) => theme.spacing(2.5), containerType: 'inline-size' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 0.25,
                  height: (theme) => theme.spacing(25),
                  px: 0.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                {column.map((point, index) => {
                  const series = SERIES[point.kind];
                  // Names the series so the bar's meaning never rests on its colour alone.
                  const text = `${series.label} on ${formatRowDate(point.date)}: ${formatEuro(point.amountInEuros)}`;
                  return (
                    <Tooltip key={`${point.kind}-${index}`} title={text}>
                      <Box
                        role="img"
                        aria-label={text}
                        tabIndex={0}
                        sx={{
                          ...FOCUS_VISIBLE_SX,
                          flex: 1,
                          maxWidth: (theme) => theme.spacing(6),
                          minHeight: (theme) => (point.amountInEuros > 0 ? theme.spacing(0.5) : 0),
                          height: `${percentOf(point.amountInEuros, largest)}%`,
                          bgcolor: seriesColor(point.kind),
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
              {/* Hidden from assistive technology because every bar's label already names its date. */}
              <Typography
                variant="caption"
                color="text.secondary"
                aria-hidden
                sx={(theme) => ({
                  alignSelf: 'center',
                  whiteSpace: 'nowrap',
                  [`@container (max-width: ${theme.spacing(12)})`]: {
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                  },
                })}
              >
                {formatRowDate(date)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
        {SERIES_KINDS.map((kind) => (
          <Stack key={kind} direction="row" spacing={1} alignItems="center">
            <Box
              aria-hidden
              sx={{
                width: (theme) => theme.spacing(1.5),
                height: (theme) => theme.spacing(1.5),
                bgcolor: seriesColor(kind),
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
  if (shares.length === 0) {
    return <NoData>No expenses to show</NoData>;
  }
  return (
    <List
      aria-label="Expenses per type"
      tabIndex={0}
      disablePadding
      // Tall enough for the four expense types; any further type scrolls.
      sx={{ ...FOCUS_VISIBLE_SX, maxHeight: (theme) => theme.spacing(40), overflow: 'auto' }}
    >
      {shares.map((share, index) => (
        <ListItem key={share.typeId} divider={index < shares.length - 1}>
          <Stack direction="row" spacing={2} alignItems="center" useFlexGap sx={{ width: 1 }}>
            <ListItemText primary={share.label} secondary={`Count: ${share.count}`} />
            <Stack alignItems="flex-end" sx={{ flexShrink: 0, textAlign: 'end' }}>
              <Typography variant="body2" sx={{ fontWeight: 'fontWeightBold' }}>
                {formatPercent(share.sharePercent)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatEuro(share.sum)}
              </Typography>
            </Stack>
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}

function EarningsTrends({ shares }: { shares: EarningShare[] }) {
  if (shares.length === 0) {
    return <NoData>No earnings to show</NoData>;
  }
  const total = shares.reduce((sum, share) => sum + Math.max(0, share.sum), 0);

  return (
    <Stack spacing={2}>
      {shares.map((share) => (
        <Stack key={share.typeId} spacing={0.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2}>
            <Typography variant="body1">{share.label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'fontWeightBold' }}>
              {formatEuro(share.sum)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            color={SERIES.earning.palette}
            value={percentOf(share.sum, total)}
            aria-label={share.label}
            aria-valuetext={formatEuro(share.sum)}
            // A neutral track keeps even the lightest tone at 3:1 contrast.
            sx={(theme) => ({
              bgcolor: 'grey.50',
              [`& .${linearProgressClasses.bar}`]: { bgcolor: earningTone(theme, share.typeId) },
            })}
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
        <ListItem key={row.key} divider={index < STATUS_ROWS.length - 1}>
          <Stack direction="row" spacing={2} alignItems="center" useFlexGap sx={{ width: 1 }}>
            <ListItemText primary={row.label} />
            <Chip size="small" color={row.color} label={counts[row.key]} />
          </Stack>
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestRequest = useRef(0);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  const loadDashboard = useCallback(() => {
    const request = ++latestRequest.current;
    userDashboard()
      .then((data) => {
        if (request === latestRequest.current) {
          setDashboard(data);
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
    loadDashboard();
    return () => {
      latestRequest.current += 1;
    };
  }, [loadDashboard]);

  useEffect(() => {
    if (loading || !restoreFocus.current) {
      return;
    }
    restoreFocus.current = false;
    if (document.activeElement === null || document.activeElement === document.body) {
      (retryButton.current ?? document.querySelector<HTMLElement>('main h1'))?.focus();
    }
  }, [loading]);

  const retry = () => {
    restoreFocus.current = true;
    setLoadError(null);
    setLoading(true);
    loadDashboard();
  };

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
        // Viewport-tall so the footer stays below the fold until the dashboard arrives.
        <Box sx={{ display: 'flex', justifyContent: 'center', paddingBlock: 8, minHeight: '100vh' }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      )}
      {loadError !== null && (
        <Alert
          severity="error"
          action={
            <Button ref={retryButton} color="inherit" size="small" onClick={retry}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}
      {dashboard && <DashboardContent dashboard={dashboard} />}
      <LiveStatus message={dashboard ? 'Dashboard loaded' : ''} />
    </>
  );
}

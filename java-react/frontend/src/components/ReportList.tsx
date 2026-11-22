import {
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type SyntheticEvent,
} from 'react';
import { useNavigate } from 'react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  SvgIcon,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
  type SvgIconProps,
  type Theme,
} from '@mui/material';
import { decideReport, getReport, listReports, reference as loadReference } from '../api/api';
import type {
  Kind,
  LineView,
  ReferenceData,
  ReportDetail,
  ReportListQuery,
  ReportSortColumn,
  ReportSummary,
  SortDir,
  StatusLabel,
} from '../api/types';
import { formatEuro, formatListDate } from '../format/format';
import { adminReportPath, reportPath } from '../routes';
import { useFeedback } from './Feedback';
import { LineRows, Pager, ResultStatus, SelectLabel, ViewIcon } from './LineTable';
import { LineViewDialog } from './LineViewDialog';
import { StatusTag } from './StatusTag';

type Mode = 'user' | 'admin';

export type ReportListProps = {
  mode: Mode;
  kind: Kind;
  onDecided?: () => void;
};

type StatusFilter = 'All' | StatusLabel;

type FilterOption = { value: StatusFilter; label: string };

type SortState = { column: ReportSortColumn; dir: SortDir } | null;

type DecisionFocus = { rowId: number; trigger: HTMLElement | null; succeeded: boolean; loadsBefore: number };

type DateField = { text: string; bound: string };

type ListFilters = { q: string; from: string; to: string };

type Column = {
  key: ReportSortColumn;
  label: string;
  size: number;
  render: (row: ReportSummary) => ReactNode;
};

const DEFAULT_FROM = '2023-01-01T00:00:00';
const FILTER_DEBOUNCE_MS = 300;
// Codes and titles are at most 50 characters, so a longer search can match nothing.
const SEARCH_MAX_LENGTH = 50;
const WHOLE_DATE = /^[1-9]\d{3}-\d{2}-\d{2}$/;

const ROWS_PER_PAGE: Record<Mode, number> = { user: 10, admin: 5 };

const ALL: FilterOption = { value: 'All', label: 'All' };
const DRAFT: FilterOption = { value: 'Draft', label: 'Draft' };
// Legacy label spelling; the API value is "Submitted".
const SUBMITTED: FilterOption = { value: 'Submitted', label: 'Submited' };
const APPROVED: FilterOption = { value: 'Approved', label: 'Approved' };
const DECLINED: FilterOption = { value: 'Declined', label: 'Declined' };

const STATUS_FILTERS: Record<Mode, readonly FilterOption[]> = {
  user: [ALL, DRAFT, SUBMITTED, APPROVED, DECLINED],
  admin: [ALL, SUBMITTED, APPROVED, DECLINED],
};

const SORT_LABEL_FOCUS_SX = {
  '&.Mui-focusVisible': {
    outline: 2,
    outlineColor: 'primary.main',
    outlineOffset: (theme: Theme) => theme.spacing(0.25),
    borderRadius: 0.5,
  },
} as const;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function localDateTime(date: Date): string {
  const day = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function dateField(bound: string): DateField {
  return { text: bound.slice(0, 10), bound };
}

// Mid-typing, a date field reports years such as 0002 or an empty bad input; both keep the last bound.
// An unchanged text keeps its bound too, so re-reading the default To leaves it at the current time.
function typedDate(current: DateField, text: string, badInput: boolean): DateField {
  if (text === '' && !badInput) {
    return current.text === '' && current.bound === '' ? current : { text, bound: '' };
  }
  if (text === current.text) {
    return current;
  }
  return { text, bound: WHOLE_DATE.test(text) ? `${text}T00:00:00` : current.bound };
}

function cellText(value: string | null | undefined): ReactNode {
  return (
    <Typography component="span" variant="body1" sx={{ overflowWrap: 'anywhere' }}>
      {value ?? ''}
    </Typography>
  );
}

function columnsFor(mode: Mode, kind: Kind): Column[] {
  const columns: Column[] = [
    {
      key: 'code',
      label: 'Code',
      size: 2,
      render: (row) => <Chip label={row.code} color="primary" component="span" />,
    },
    { key: 'title', label: 'Title', size: 3, render: (row) => cellText(row.title) },
    { key: 'createdOn', label: 'Date', size: 2, render: (row) => cellText(formatListDate(row.createdOn)) },
    {
      key: 'totalEur',
      label: kind === 'expense' ? 'Total Spent' : 'Total Earned',
      size: 3,
      render: (row) => cellText(formatEuro(row.totalEur)),
    },
    { key: 'status', label: 'Status', size: 2, render: (row) => <StatusTag status={row.status} /> },
  ];
  if (mode === 'admin') {
    columns.splice(1, 0, {
      key: 'submittedBy',
      label: 'Submitted By',
      size: 2,
      render: (row) => cellText(row.submittedBy),
    });
  }
  return columns;
}

function ExpandIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z" />
    </SvgIcon>
  );
}

type LineSubTableProps = {
  kind: Kind;
  code: string;
  lines: LineView[];
  onView: (line: LineView) => void;
};

function LineSubTable({ kind, code, lines, onView }: LineSubTableProps) {
  return (
    <LineRows
      kind={kind}
      label={`${kind === 'expense' ? 'Expenses' : 'Earnings'} of ${code}`}
      typeLabel="Type"
      lines={lines}
      onView={onView}
      nested
    />
  );
}

type ReportRowProps = {
  mode: Mode;
  kind: Kind;
  row: ReportSummary;
  columns: Column[];
  gridColumns: number;
  idBase: string;
  requested: boolean;
  detail: ReportDetail | undefined;
  deciding: boolean;
  onToggle: (id: number, expanded: boolean) => void;
  onDecide: (row: ReportSummary, accept: boolean) => void;
  onOpen: (row: ReportSummary) => void;
  onViewLine: (line: LineView) => void;
};

const ReportRow = memo(function ReportRow({
  mode,
  kind,
  row,
  columns,
  gridColumns,
  idBase,
  requested,
  detail,
  deciding,
  onToggle,
  onDecide,
  onOpen,
  onViewLine,
}: ReportRowProps) {
  const theme = useTheme();
  const canDecide = mode === 'admin' && row.status === 'Submitted';
  // Opens once lines are loaded, so it animates to its final height; stays open while they reload.
  const [opened, setOpened] = useState(false);
  const open = requested && (detail !== undefined || opened);
  if (open !== opened) {
    setOpened(open);
  }
  const pending = requested && !open;
  return (
    <Accordion
      disableGutters
      square
      elevation={0}
      expanded={open}
      onChange={() => onToggle(row.id, !requested)}
      slotProps={{ heading: { component: 'h2' }, transition: { unmountOnExit: true } }}
    >
      <AccordionSummary
        id={`${idBase}-${row.id}-summary`}
        aria-controls={`${idBase}-${row.id}-details`}
        aria-busy={pending}
        expandIcon={
          pending ? (
            <CircularProgress size={theme.spacing(3)} aria-label="Loading report lines" />
          ) : (
            <ExpandIcon color="primary" />
          )
        }
        sx={{
          '&:hover:not(.Mui-focusVisible)': { bgcolor: 'action.hover' },
        }}
      >
        <Grid
          container
          component="span"
          columns={gridColumns}
          columnSpacing={2}
          rowSpacing={1}
          sx={{ flexGrow: 1, alignItems: 'center' }}
        >
          {columns.map((column) => (
            <Grid key={column.key} component="span" size={{ xs: gridColumns / 2, md: column.size }}>
              <Typography
                variant="caption"
                color="text.secondary"
                component="span"
                sx={{ display: { xs: 'block', md: 'none' } }}
              >
                {column.label}
              </Typography>
              {column.render(row)}
            </Grid>
          ))}
        </Grid>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2} useFlexGap>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            justifyContent="flex-end"
            sx={{ flexWrap: 'wrap' }}
          >
            {canDecide && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  disabled={deciding}
                  onClick={() => onDecide(row, true)}
                >
                  Approve
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  disabled={deciding}
                  onClick={() => onDecide(row, false)}
                >
                  Decline
                </Button>
              </>
            )}
            <Button id={`${idBase}-${row.id}-open`} variant="contained" onClick={() => onOpen(row)}>
              View Report Details
            </Button>
          </Stack>
          {detail ? (
            <LineSubTable kind={kind} code={row.code} lines={detail.lines} onView={onViewLine} />
          ) : (
            <Stack alignItems="center" sx={{ paddingBlock: 2 }}>
              <CircularProgress aria-label="Loading report lines" />
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

type LineViewerHandle = { show: (line: LineView) => void };

type ReportLineViewerProps = { kind: Kind; ref: Ref<LineViewerHandle> };

// Owns the dialog's state, so opening or closing it re-renders neither the rows nor the filters.
function ReportLineViewer({ kind, ref }: ReportLineViewerProps) {
  const feedback = useFeedback();
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [viewer, setViewer] = useState<{ line: LineView; open: boolean } | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      show: (line) => {
        const pending = { line, open: true };
        setViewer(pending);
        if (reference) {
          return;
        }
        loadReference().then(setReference, (err: unknown) => {
          feedback.error(err);
          setViewer((current) => (current === pending ? null : current));
        });
      },
    }),
    [reference, feedback],
  );

  if (!viewer || !reference) {
    return null;
  }
  return (
    <LineViewDialog
      open={viewer.open}
      kind={kind}
      line={viewer.line}
      vatRate={reference.vatRate}
      onClose={() => setViewer((current) => current && { ...current, open: false })}
    />
  );
}

export function ReportList({ mode, kind, onDecided }: ReportListProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const idBase = useId();
  const rangeLabelId = `${idBase}-range`;

  const [status, setStatus] = useState<StatusFilter>('All');
  const [searchText, setSearchText] = useState('');
  const [fromField, setFromField] = useState(() => dateField(DEFAULT_FROM));
  const [toField, setToField] = useState(() => dateField(localDateTime(new Date())));
  const [filters, setFilters] = useState<ListFilters>(() => ({ q: '', from: fromField.bound, to: toField.bound }));
  const [sort, setSort] = useState<SortState>(null);
  const [rows, setRows] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const startedLoads = useRef(0);
  const [settledLoad, setSettledLoad] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ReportDetail>>({});
  const decisionPending = useRef(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionFocus, setDecisionFocus] = useState<DecisionFocus | null>(null);
  const [retryLoadsBefore, setRetryLoadsBefore] = useState<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const lineViewer = useRef<LineViewerHandle>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [heldBlockSize, setHeldBlockSize] = useState<number | null>(null);

  // Reset during render so rows and details of the previous kind are never shown with the new one.
  const [listedKind, setListedKind] = useState(kind);
  if (listedKind !== kind) {
    setListedKind(kind);
    setRows([]);
    setLoading(true);
    setExpandedId(null);
    setDetails({});
    setPage(0);
    setDecisionFocus(null);
    // The DOM still holds the previous kind's list; keeping its height stops the page shrinking and losing its scroll.
    setHeldBlockSize(bodyRef.current?.getBoundingClientRect().height ?? null);
  }

  const shownKind = useRef(kind);
  useEffect(() => {
    shownKind.current = kind;
  }, [kind]);

  const typedQ = searchText.trim();
  const typedFrom = fromField.bound;
  const typedTo = toField.bound;
  // The shown texts restart the wait too, since a keystroke into an incomplete date leaves its bound as it was.
  useEffect(() => {
    if (typedQ === filters.q && typedFrom === filters.from && typedTo === filters.to) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setFilters({ q: typedQ, from: typedFrom, to: typedTo });
      setPage(0);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText, fromField.text, toField.text, typedQ, typedFrom, typedTo, filters]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    startedLoads.current += 1;
    const loadId = startedLoads.current;
    const query: ReportListQuery = {
      kind,
      status: status === 'All' ? undefined : status,
      q: filters.q || undefined,
      sort: sort ? `${sort.column},${sort.dir}` : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    };
    setLoading(true);
    setLoadFailed(false);
    listReports(query, controller.signal)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
          setLoadFailed(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          feedback.error(err);
          // Rows of the previous filters would otherwise stay on screen as if they matched these.
          setRows([]);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSettledLoad(loadId);
          setHeldBlockSize(null);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [kind, status, filters, sort, reloadKey, feedback]);

  // A pending decision disables its focused button, which drops focus to the body. A failure returns it to that
  // button; a success waits for its reload, which may remove the row's buttons or the row itself.
  useEffect(() => {
    if (decisionFocus === null || (decisionFocus.succeeded && settledLoad <= decisionFocus.loadsBefore)) {
      return;
    }
    setDecisionFocus(null);
    const active = document.activeElement;
    if (active !== null && active !== document.body) {
      return;
    }
    const candidates = [
      decisionFocus.succeeded ? null : decisionFocus.trigger,
      document.getElementById(`${idBase}-${decisionFocus.rowId}-open`),
      document.getElementById(`${idBase}-${decisionFocus.rowId}-summary`),
      searchInput.current,
    ];
    candidates.find((candidate) => candidate?.isConnected && !candidate.matches(':disabled'))?.focus();
  }, [decisionFocus, settledLoad, idBase]);

  useEffect(() => {
    if (retryLoadsBefore === null || settledLoad <= retryLoadsBefore) {
      return;
    }
    setRetryLoadsBefore(null);
    const active = document.activeElement;
    if (active !== null && active !== document.body) {
      return;
    }
    const candidates = [retryButton.current, searchInput.current];
    candidates.find((candidate) => candidate?.isConnected && !candidate.matches(':disabled'))?.focus();
  }, [retryLoadsBefore, settledLoad]);

  const detailMissing = expandedId !== null && details[expandedId] === undefined;

  useEffect(() => {
    if (expandedId === null || !detailMissing) {
      return undefined;
    }
    let cancelled = false;
    getReport(kind, expandedId)
      .then((detail) => {
        if (!cancelled) {
          setDetails((current) => ({ ...current, [expandedId]: detail }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          feedback.error(err);
          setExpandedId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, expandedId, detailMissing, feedback]);

  const columns = useMemo(() => columnsFor(mode, kind), [mode, kind]);
  const gridColumns = useMemo(() => columns.reduce((sum, column) => sum + column.size, 0), [columns]);
  const rowsPerPage = ROWS_PER_PAGE[mode];
  const lastPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleRows = useMemo(
    () => rows.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage),
    [rows, currentPage, rowsPerPage],
  );

  const changeStatus = useCallback((_event: MouseEvent<HTMLElement>, next: StatusFilter | null) => {
    if (next !== null) {
      setStatus(next);
      setPage(0);
    }
  }, []);

  // A date field sends no change event when its last segment is cleared, so keyup and blur re-read it.
  const syncFrom = useCallback((event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value, validity } = event.currentTarget;
    setFromField((current) => typedDate(current, value, validity.badInput));
  }, []);

  const syncTo = useCallback((event: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { value, validity } = event.currentTarget;
    setToField((current) => typedDate(current, value, validity.badInput));
  }, []);

  const changeSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value.slice(0, SEARCH_MAX_LENGTH));
  }, []);

  const toggleSort = useCallback((column: ReportSortColumn) => {
    setSort((current) =>
      current?.column === column && current.dir === 'asc' ? { column, dir: 'desc' } : { column, dir: 'asc' },
    );
    setPage(0);
  }, []);

  const selectSort = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const [key, dir] = event.target.value.split(',');
      const column = columns.find((candidate) => candidate.key === key);
      setSort(column && (dir === 'asc' || dir === 'desc') ? { column: column.key, dir } : null);
      setPage(0);
    },
    [columns],
  );

  const toggleRow = useCallback((id: number, isExpanded: boolean) => {
    setExpandedId(isExpanded ? id : null);
  }, []);

  const openReport = useCallback(
    (row: ReportSummary) => {
      navigate(mode === 'admin' ? adminReportPath(kind, row.id) : reportPath(kind, row.id));
    },
    [navigate, mode, kind],
  );

  const decide = useCallback(
    async (row: ReportSummary, accept: boolean) => {
      if (decisionPending.current) {
        return;
      }
      decisionPending.current = true;
      const focused = document.activeElement;
      const trigger = focused instanceof HTMLElement && focused !== document.body ? focused : null;
      setDeciding(true);
      try {
        await decideReport(kind, row.id, accept);
        feedback.success(
          `${kind === 'expense' ? 'Expense' : 'Earning'} report was ${accept ? 'approved' : 'declined'}`,
        );
        // Expense and earning ids overlap, so a detail cached after a kind switch is not this report's.
        if (shownKind.current === kind) {
          setDetails((current) => {
            const next = { ...current };
            delete next[row.id];
            return next;
          });
        }
        setReloadKey((key) => key + 1);
        onDecided?.();
        // Loads started before now, even one that settles meanwhile, are not this decision's reload.
        setDecisionFocus({ rowId: row.id, trigger, succeeded: true, loadsBefore: startedLoads.current });
      } catch (err) {
        feedback.error(err);
        setDecisionFocus({ rowId: row.id, trigger, succeeded: false, loadsBefore: startedLoads.current });
      } finally {
        decisionPending.current = false;
        setDeciding(false);
      }
    },
    [kind, feedback, onDecided],
  );

  const retryLoad = () => {
    setRetryLoadsBefore(startedLoads.current);
    setReloadKey((key) => key + 1);
  };

  const viewReportLine = useCallback((line: LineView) => {
    lineViewer.current?.show(line);
  }, []);

  const statusVertical = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'), { noSsr: true });
  const statusFullWidth = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'), { noSsr: true });

  const filterBar = useMemo(
    () => (
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        useFlexGap
        alignItems={{ xs: 'stretch', md: 'flex-end' }}
        sx={{ flexWrap: { md: 'wrap' } }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          orientation={statusVertical ? 'vertical' : 'horizontal'}
          fullWidth={statusFullWidth}
          value={status}
          onChange={changeStatus}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS[mode].map((option) => (
            <ToggleButton key={option.value} value={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Stack
          role="group"
          aria-labelledby={rangeLabelId}
          spacing={1}
          useFlexGap
          sx={{ flexGrow: 1, minInlineSize: (theme) => ({ md: theme.spacing(36) }) }}
        >
          <Typography id={rangeLabelId} variant="caption" color="text.secondary">
            Filter by date range
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
            <TextField
              type="date"
              size="small"
              label="From"
              value={fromField.text}
              onChange={syncFrom}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { onKeyUp: syncFrom, onBlur: syncFrom } }}
              sx={{ flexGrow: 1 }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={toField.text}
              onChange={syncTo}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { onKeyUp: syncTo, onBlur: syncTo } }}
              sx={{ flexGrow: 1 }}
            />
          </Stack>
        </Stack>
        <TextField
          size="small"
          placeholder="Search by title"
          value={searchText}
          onChange={changeSearch}
          inputRef={searchInput}
          sx={{ flexGrow: 1, minInlineSize: (theme) => ({ md: theme.spacing(30) }) }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search by title', maxLength: SEARCH_MAX_LENGTH },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <ViewIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
    ),
    [
      mode,
      status,
      changeStatus,
      statusVertical,
      statusFullWidth,
      rangeLabelId,
      fromField.text,
      syncFrom,
      toField.text,
      syncTo,
      searchText,
      changeSearch,
    ],
  );

  const header = useMemo(
    () => (
      <Box>
        <TextField
          select
          fullWidth
          size="small"
          name="sort"
          label="Sort by"
          value={sort ? `${sort.column},${sort.dir}` : ''}
          onChange={selectSort}
          slots={{ inputLabel: SelectLabel }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ display: { md: 'none' } }}
        >
          <MenuItem value="">Default</MenuItem>
          {columns.flatMap((column) =>
            (['asc', 'desc'] as const).map((dir) => (
              <MenuItem key={`${column.key},${dir}`} value={`${column.key},${dir}`}>
                {`${column.label}, ${dir === 'asc' ? 'ascending' : 'descending'}`}
              </MenuItem>
            )),
          )}
        </TextField>
        <Paper variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
          <Stack direction="row" alignItems="center" sx={{ paddingInline: 2, paddingBlock: 2 }}>
            <Grid container columns={gridColumns} columnSpacing={2} sx={{ flexGrow: 1 }}>
              {columns.map((column) => {
                const active = sort?.column === column.key;
                const direction = active ? sort.dir : 'asc';
                return (
                  <Grid key={column.key} size={column.size}>
                    <TableSortLabel
                      active={active}
                      direction={direction}
                      onClick={() => toggleSort(column.key)}
                      aria-label={
                        active
                          ? `${column.label}, sorted ${direction === 'asc' ? 'ascending' : 'descending'}`
                          : undefined
                      }
                      sx={SORT_LABEL_FOCUS_SX}
                    >
                      {column.label}
                    </TableSortLabel>
                  </Grid>
                );
              })}
            </Grid>
            <Box aria-hidden sx={{ inlineSize: (theme) => theme.spacing(3), flexShrink: 0 }} />
          </Stack>
        </Paper>
      </Box>
    ),
    [columns, gridColumns, sort, selectSort, toggleSort],
  );

  let body: ReactNode;
  if (rows.length === 0 && loading) {
    body = (
      <Stack alignItems="center" sx={{ paddingBlock: 4, minBlockSize: heldBlockSize ?? undefined }}>
        <CircularProgress aria-label="Loading reports" />
      </Stack>
    );
  } else if (rows.length === 0 && loadFailed) {
    body = (
      <Alert
        severity="error"
        action={
          <Button ref={retryButton} color="inherit" size="small" onClick={retryLoad}>
            Retry
          </Button>
        }
      >
        Reports could not be loaded.
      </Alert>
    );
  } else if (rows.length === 0) {
    body = <Typography color="text.secondary">No records yet</Typography>;
  } else {
    body = (
      <Stack spacing={1} aria-busy={loading}>
        {header}
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          {visibleRows.map((row) => (
            <ReportRow
              key={row.id}
              mode={mode}
              kind={kind}
              row={row}
              columns={columns}
              gridColumns={gridColumns}
              idBase={idBase}
              requested={expandedId === row.id}
              detail={details[row.id]}
              deciding={deciding}
              onToggle={toggleRow}
              onDecide={decide}
              onOpen={openReport}
              onViewLine={viewReportLine}
            />
          ))}
        </Paper>
        <Pager count={rows.length} page={currentPage} rowsPerPage={rowsPerPage} onPageChange={setPage} />
      </Stack>
    );
  }

  // Blank while loading, so an unchanged result is announced again when the next load ends.
  let statusMessage: string | undefined;
  if (loading) {
    statusMessage = '';
  } else if (loadFailed) {
    statusMessage = 'Reports failed to load';
  }

  return (
    <Stack spacing={2} useFlexGap>
      {filterBar}
      <ResultStatus
        total={rows.length}
        page={currentPage}
        rowsPerPage={rowsPerPage}
        nouns={['report', 'reports']}
        message={statusMessage}
      />
      <Box ref={bodyRef}>{body}</Box>
      {/* Remounted per kind, so a line opened before a kind switch never shows after it. */}
      <ReportLineViewer key={kind} kind={kind} ref={lineViewer} />
    </Stack>
  );
}

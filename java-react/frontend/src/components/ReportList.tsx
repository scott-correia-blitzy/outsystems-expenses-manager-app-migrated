import { useEffect, useId, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  SvgIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  type SvgIconProps,
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
import { formatEuro, formatListDate, formatRowDate } from '../format/format';
import { adminReportPath, reportPath } from '../routes';
import { useFeedback } from './Feedback';
import { ViewIcon } from './LineTable';
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

type Column = {
  key: ReportSortColumn;
  label: string;
  size: number;
  render: (row: ReportSummary) => ReactNode;
};

const DEFAULT_FROM = '2023-01-01T00:00:00';

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
    outlineOffset: 2,
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

function dateBound(pickedDate: string): string {
  return pickedDate ? `${pickedDate}T00:00:00` : '';
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
  const isExpense = kind === 'expense';
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={`${isExpense ? 'Expenses' : 'Earnings'} of ${code}`}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'grey.50' }}>
            <TableCell>Date</TableCell>
            <TableCell>Title</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">{isExpense ? 'Amount Spent' : 'Amount Earned'}</TableCell>
            <TableCell>Type</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} align="center">
                <Typography variant="body2" color="text.secondary">
                  No records available
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatRowDate(line.date)}</TableCell>
                <TableCell sx={{ overflowWrap: 'break-word' }}>{line.title ?? ''}</TableCell>
                <TableCell sx={{ overflowWrap: 'break-word' }}>{line.description ?? ''}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {formatEuro(line.amountInEuros)}
                </TableCell>
                <TableCell>{line.typeLabel ?? ''}</TableCell>
                <TableCell align="center">
                  <IconButton aria-label="View" color="primary" onClick={() => onView(line)}>
                    <ViewIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

type ReportRowProps = {
  mode: Mode;
  kind: Kind;
  row: ReportSummary;
  columns: Column[];
  gridColumns: number;
  idBase: string;
  expanded: boolean;
  detail: ReportDetail | undefined;
  deciding: boolean;
  onToggle: (id: number, expanded: boolean) => void;
  onDecide: (row: ReportSummary, accept: boolean) => void;
  onOpen: (row: ReportSummary) => void;
  onViewLine: (line: LineView) => void;
};

function ReportRow({
  mode,
  kind,
  row,
  columns,
  gridColumns,
  idBase,
  expanded,
  detail,
  deciding,
  onToggle,
  onDecide,
  onOpen,
  onViewLine,
}: ReportRowProps) {
  const canDecide = mode === 'admin' && row.status === 'Submitted';
  return (
    <Accordion
      disableGutters
      square
      elevation={0}
      expanded={expanded}
      onChange={(_event, isExpanded) => onToggle(row.id, isExpanded)}
      slotProps={{ heading: { component: 'h2' }, transition: { unmountOnExit: true } }}
    >
      <AccordionSummary
        id={`${idBase}-${row.id}-summary`}
        aria-controls={`${idBase}-${row.id}-details`}
        expandIcon={<ExpandIcon color="primary" />}
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
            <Button variant="contained" onClick={() => onOpen(row)}>
              View Report Details
            </Button>
          </Stack>
          {detail ? (
            <LineSubTable kind={kind} code={row.code} lines={detail.lines} onView={onViewLine} />
          ) : (
            <Stack alignItems="center" sx={{ paddingBlock: 2 }}>
              <CircularProgress size={32} aria-label="Loading report lines" />
            </Stack>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

export function ReportList({ mode, kind, onDecided }: ReportListProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const idBase = useId();
  const rangeLabelId = `${idBase}-range`;

  const [status, setStatus] = useState<StatusFilter>('All');
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(() => localDateTime(new Date()));
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [rows, setRows] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ReportDetail>>({});
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [viewLine, setViewLine] = useState<LineView | null>(null);

  // Reset during render so rows and details of the previous kind are never shown with the new one.
  const [listedKind, setListedKind] = useState(kind);
  if (listedKind !== kind) {
    setListedKind(kind);
    setRows([]);
    setLoading(true);
    setExpandedId(null);
    setDetails({});
    setPage(0);
  }

  useEffect(() => {
    let cancelled = false;
    const query: ReportListQuery = {
      kind,
      status: status === 'All' ? undefined : status,
      q: q.trim() || undefined,
      sort: sort ? `${sort.column},${sort.dir}` : undefined,
      from: from || undefined,
      to: to || undefined,
    };
    setLoading(true);
    listReports(query)
      .then((result) => {
        if (!cancelled) {
          setRows(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          feedback.error(err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind, status, q, sort, from, to, reloadKey, feedback]);

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

  const columns = columnsFor(mode, kind);
  const gridColumns = columns.reduce((sum, column) => sum + column.size, 0);
  const rowsPerPage = ROWS_PER_PAGE[mode];
  const lastPage = Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleRows = rows.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

  const changeStatus = (_event: MouseEvent<HTMLElement>, next: StatusFilter | null) => {
    if (next !== null) {
      setStatus(next);
      setPage(0);
    }
  };

  const changeFrom = (event: ChangeEvent<HTMLInputElement>) => {
    setFrom(dateBound(event.target.value));
    setPage(0);
  };

  const changeTo = (event: ChangeEvent<HTMLInputElement>) => {
    setTo(dateBound(event.target.value));
    setPage(0);
  };

  const changeSearch = (event: ChangeEvent<HTMLInputElement>) => {
    setQ(event.target.value);
    setPage(0);
  };

  const toggleSort = (column: ReportSortColumn) => {
    setSort((current) =>
      current?.column === column && current.dir === 'asc' ? { column, dir: 'desc' } : { column, dir: 'asc' },
    );
    setPage(0);
  };

  const toggleRow = (id: number, isExpanded: boolean) => {
    setExpandedId(isExpanded ? id : null);
  };

  const openReport = (row: ReportSummary) => {
    navigate(mode === 'admin' ? adminReportPath(kind, row.id) : reportPath(kind, row.id));
  };

  const decide = async (row: ReportSummary, accept: boolean) => {
    setDecidingId(row.id);
    try {
      await decideReport(kind, row.id, accept);
      feedback.success(
        `${kind === 'expense' ? 'Expense' : 'Earning'} report was ${accept ? 'approved' : 'declined'}`,
      );
      setDetails((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setReloadKey((key) => key + 1);
      onDecided?.();
    } catch (err) {
      feedback.error(err);
    } finally {
      setDecidingId(null);
    }
  };

  const viewReportLine = async (line: LineView) => {
    if (reference) {
      setViewLine(line);
      return;
    }
    try {
      setReference(await loadReference());
      setViewLine(line);
    } catch (err) {
      feedback.error(err);
    }
  };

  const filterBar = (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      useFlexGap
      alignItems={{ xs: 'stretch', md: 'flex-end' }}
      sx={{ flexWrap: 'wrap' }}
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
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
        spacing={0.5}
        sx={{ flexGrow: 1, minInlineSize: { md: '18rem' } }}
      >
        <Typography id={rangeLabelId} variant="caption" color="text.secondary">
          Filter by date range
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap>
          <TextField
            type="date"
            size="small"
            label="From"
            value={from.slice(0, 10)}
            onChange={changeFrom}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flexGrow: 1 }}
          />
          <TextField
            type="date"
            size="small"
            label="To"
            value={to.slice(0, 10)}
            onChange={changeTo}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flexGrow: 1 }}
          />
        </Stack>
      </Stack>
      <TextField
        size="small"
        placeholder="Search by title"
        value={q}
        onChange={changeSearch}
        sx={{ flexGrow: 1, minInlineSize: { md: '15rem' } }}
        slotProps={{
          htmlInput: { 'aria-label': 'Search by title' },
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
  );

  const expandIconSpacer = <Box aria-hidden sx={{ inlineSize: (theme) => theme.spacing(3), flexShrink: 0 }} />;

  const header = (
    <Paper variant="outlined" sx={{ display: { xs: 'none', md: 'block' } }}>
      <Stack direction="row" alignItems="center" sx={{ paddingInline: 2, paddingBlock: 1.5 }}>
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
        {expandIconSpacer}
      </Stack>
    </Paper>
  );

  let body: ReactNode;
  if (rows.length === 0) {
    body = loading ? (
      <Stack alignItems="center" sx={{ paddingBlock: 4 }}>
        <CircularProgress aria-label="Loading reports" />
      </Stack>
    ) : (
      <Typography color="text.secondary">No records yet</Typography>
    );
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
              expanded={expandedId === row.id}
              detail={details[row.id]}
              deciding={decidingId === row.id}
              onToggle={toggleRow}
              onDecide={decide}
              onOpen={openReport}
              onViewLine={viewReportLine}
            />
          ))}
        </Paper>
        <TablePagination
          component="div"
          count={rows.length}
          page={currentPage}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[]}
          onPageChange={(_event, next) => setPage(next)}
          labelDisplayedRows={({ from: first, to: last, count }) => `${first} to ${last} of ${count} items`}
        />
      </Stack>
    );
  }

  return (
    <Stack spacing={2} useFlexGap>
      {filterBar}
      {body}
      {viewLine && reference && (
        <LineViewDialog
          open
          kind={kind}
          line={viewLine}
          vatRate={reference.vatRate}
          onClose={() => setViewLine(null)}
        />
      )}
    </Stack>
  );
}

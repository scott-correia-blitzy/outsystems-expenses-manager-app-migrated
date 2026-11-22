import { memo, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
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
  Typography,
  useMediaQuery,
  type InputLabelProps,
  type SvgIconProps,
  type Theme,
} from '@mui/material';
import type { Kind, LineView, SortDir } from '../api/types';
import { formatEuro, formatRowDate } from '../format/format';
import { LiveStatus } from './Feedback';

export function ViewIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14" />
    </SvgIcon>
  );
}

export function EditIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z" />
    </SvgIcon>
  );
}

export function DeleteIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z" />
    </SvgIcon>
  );
}

function resultSummary(
  total: number,
  page: number,
  rowsPerPage: number,
  [singular, plural]: readonly [string, string],
): string {
  if (total === 0) {
    return `No ${plural} found`;
  }
  const first = page * rowsPerPage + 1;
  const last = Math.min(total, first + rowsPerPage - 1);
  return `Showing ${first} to ${last} of ${total} ${total === 1 ? singular : plural}`;
}

type ResultStatusProps = {
  total: number;
  page: number;
  rowsPerPage: number;
  nouns: readonly [string, string];
  message?: string;
};

export function ResultStatus({ total, page, rowsPerPage, nouns, message }: ResultStatusProps) {
  return <LiveStatus message={message ?? resultSummary(total, page, rowsPerPage, nouns)} />;
}

// A <label for> cannot target the select's div; the select names itself through aria-labelledby.
export function SelectLabel({ htmlFor: _htmlFor, ...props }: InputLabelProps) {
  return <InputLabel {...props} component="span" sx={{ cursor: 'default' }} />;
}

export type LineTableProps = {
  kind: Kind;
  lines: LineView[];
  canEdit: boolean;
  viewDisabled?: boolean;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  onView: (line: LineView) => void;
  onEdit: (line: LineView) => void;
  onDelete: (line: LineView) => void;
  actions?: ReactNode;
};

type SortKey = 'date' | 'title' | 'description' | 'amountInEuros' | 'typeLabel';

type SortState = { key: SortKey; dir: SortDir } | null;

type Column = {
  key: SortKey;
  label: string;
  value: (line: LineView) => string;
  spacingWidth?: number;
  align?: 'right';
  nowrap?: boolean;
  wide?: boolean;
};

const ROWS_PER_PAGE = 10;
const COLUMN_COUNT = 6;
const CARD_FIELDS: readonly SortKey[] = ['date', 'amountInEuros', 'title', 'description', 'typeLabel'];
// The icon buttons' own padding makes up the rest of the usual cell inset.
const ACTIONS_INSET = { paddingInline: 1 } as const;

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').localeCompare(b ?? '', 'en', { sensitivity: 'base' });
}

function compareIso(a: string | null | undefined, b: string | null | undefined): number {
  const left = a ?? '';
  const right = b ?? '';
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): number {
  const left = typeof a === 'number' && Number.isFinite(a) ? a : Number.NEGATIVE_INFINITY;
  const right = typeof b === 'number' && Number.isFinite(b) ? b : Number.NEGATIVE_INFINITY;
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

const COMPARATORS: Record<SortKey, (a: LineView, b: LineView) => number> = {
  date: (a, b) => compareIso(a.date, b.date),
  title: (a, b) => compareText(a.title, b.title),
  description: (a, b) => compareText(a.description, b.description),
  amountInEuros: (a, b) => compareNumber(a.amountInEuros, b.amountInEuros),
  typeLabel: (a, b) => compareText(a.typeLabel, b.typeLabel),
};

function columnsFor(kind: Kind, typeLabel = kind === 'expense' ? 'Expense Type' : 'Earning Type'): Column[] {
  return [
    { key: 'date', label: 'Date', value: (line) => formatRowDate(line.date), spacingWidth: 16, nowrap: true },
    { key: 'title', label: 'Title', value: (line) => line.title ?? '', wide: true },
    { key: 'description', label: 'Description', value: (line) => line.description ?? '', wide: true },
    {
      key: 'amountInEuros',
      label: kind === 'expense' ? 'Amount Spent' : 'Amount Earned',
      value: (line) => formatEuro(line.amountInEuros),
      spacingWidth: 20,
      align: 'right',
      nowrap: true,
    },
    { key: 'typeLabel', label: typeLabel, value: (line) => line.typeLabel ?? '', spacingWidth: 19 },
  ];
}

function cardFields(columns: Column[]): Column[] {
  return CARD_FIELDS.flatMap((key) => columns.filter((column) => column.key === key));
}

function useStackedLines(): boolean {
  return useMediaQuery((theme: Theme) => theme.breakpoints.down('md'), { noSsr: true });
}

type LineRowsProps = {
  kind: Kind;
  label: string;
  lines: LineView[];
  typeLabel?: string;
  sort?: SortState;
  onSort?: (key: SortKey) => void;
  nested?: boolean;
  viewDisabled?: boolean;
  editDisabled?: boolean;
  deleteDisabled?: boolean;
  onView: (line: LineView) => void;
  onEdit?: (line: LineView) => void;
  onDelete?: (line: LineView) => void;
};

export const LineRows = memo(function LineRows({
  kind,
  label,
  lines,
  typeLabel,
  sort = null,
  onSort,
  nested = false,
  viewDisabled = false,
  editDisabled = false,
  deleteDisabled = false,
  onView,
  onEdit,
  onDelete,
}: LineRowsProps) {
  const stacked = useStackedLines();
  const columns = useMemo(() => columnsFor(kind, typeLabel), [kind, typeLabel]);
  const actionsSpacingWidth = onEdit || onDelete ? 19 : 12;

  const lineActions = (line: LineView, justifyContent: 'center' | 'flex-end') => (
    <Stack direction="row" spacing={1} useFlexGap justifyContent={justifyContent}>
      <IconButton aria-label="View" color="primary" disabled={viewDisabled} onClick={() => onView(line)}>
        <ViewIcon />
      </IconButton>
      {onEdit && (
        <IconButton aria-label="Edit" color="primary" disabled={editDisabled} onClick={() => onEdit(line)}>
          <EditIcon />
        </IconButton>
      )}
      {onDelete && (
        <IconButton aria-label="Delete" color="primary" disabled={deleteDisabled} onClick={() => onDelete(line)}>
          <DeleteIcon />
        </IconButton>
      )}
    </Stack>
  );

  if (stacked) {
    if (lines.length === 0) {
      return (
        <Paper variant="outlined">
          <Stack alignItems="center" sx={{ padding: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No records available
            </Typography>
          </Stack>
        </Paper>
      );
    }
    return (
      <Stack role="list" aria-label={label} spacing={1} useFlexGap>
        {lines.map((line) => (
          <Paper key={line.id} role="listitem" variant="outlined">
            <Grid container columnSpacing={2} rowSpacing={1} sx={{ padding: 2 }}>
              {cardFields(columns).map((column) => (
                <Grid key={column.key} size={column.wide ? 12 : 6}>
                  <Typography variant="caption" color="text.secondary" component="div">
                    {column.label}
                  </Typography>
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                    {column.value(line)}
                  </Typography>
                </Grid>
              ))}
              <Grid size={6}>{lineActions(line, 'flex-end')}</Grid>
            </Grid>
          </Paper>
        ))}
      </Stack>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" aria-label={label} sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow sx={nested ? { bgcolor: 'grey.50' } : undefined}>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <TableCell
                  key={column.key}
                  align={column.align}
                  sortDirection={active ? sort.dir : false}
                  sx={{
                    width: (theme) =>
                      column.spacingWidth === undefined ? 'auto' : theme.spacing(column.spacingWidth),
                  }}
                >
                  {onSort ? (
                    <TableSortLabel
                      active={active}
                      direction={active ? sort.dir : 'asc'}
                      onClick={() => onSort(column.key)}
                      sx={{
                        '&.Mui-focusVisible': {
                          outline: 2,
                          outlineColor: 'primary.main',
                          outlineOffset: (theme) => theme.spacing(0.25),
                          borderRadius: 0.5,
                        },
                      }}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              );
            })}
            <TableCell
              align="center"
              sx={{ ...ACTIONS_INSET, width: (theme) => theme.spacing(actionsSpacingWidth) }}
            >
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} align="center">
                <Typography variant="body2" color="text.secondary">
                  No records available
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line) => (
              <TableRow key={line.id} hover={!nested}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    align={column.align}
                    sx={column.nowrap ? { whiteSpace: 'nowrap' } : { overflowWrap: 'anywhere' }}
                  >
                    {column.value(line)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={ACTIONS_INSET}>
                  {lineActions(line, 'center')}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
});

export function LineTable({
  kind,
  lines,
  canEdit,
  viewDisabled = false,
  editDisabled = false,
  deleteDisabled = false,
  onView,
  onEdit,
  onDelete,
  actions,
}: LineTableProps) {
  const stacked = useStackedLines();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = needle
      ? lines.filter((line) => (line.title ?? '').toLowerCase().includes(needle))
      : lines;
    if (sort === null) {
      return matching;
    }
    const compare = COMPARATORS[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...matching].sort((a, b) => sign * compare(a, b));
  }, [lines, search, sort]);

  const lastPage = Math.max(0, Math.ceil(rows.length / ROWS_PER_PAGE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visibleRows = rows.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);
  const columns = columnsFor(kind);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current?.key === key && current.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' },
    );
  };

  const selectSort = (event: ChangeEvent<HTMLInputElement>) => {
    const [key, dir] = event.target.value.split(',');
    const column = columns.find((candidate) => candidate.key === key);
    setSort(column && (dir === 'asc' || dir === 'desc') ? { key: column.key, dir } : null);
  };

  return (
    <Stack spacing={2} useFlexGap>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        justifyContent="flex-end"
        alignItems={{ xs: 'stretch', sm: 'center' }}
      >
        <TextField
          size="small"
          placeholder="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          sx={{ minWidth: (theme) => ({ sm: theme.spacing(40) }) }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <ViewIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        {actions}
      </Stack>
      {stacked && (
        <TextField
          select
          fullWidth
          size="small"
          name="sort"
          label="Sort by"
          value={sort ? `${sort.key},${sort.dir}` : ''}
          onChange={selectSort}
          slots={{ inputLabel: SelectLabel }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
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
      )}
      <LineRows
        kind={kind}
        label={kind === 'expense' ? 'Expenses' : 'Earnings'}
        lines={visibleRows}
        sort={sort}
        onSort={toggleSort}
        viewDisabled={viewDisabled}
        editDisabled={editDisabled}
        deleteDisabled={deleteDisabled}
        onView={onView}
        onEdit={canEdit ? onEdit : undefined}
        onDelete={canEdit ? onDelete : undefined}
      />
      <TablePagination
        component="div"
        count={rows.length}
        page={currentPage}
        rowsPerPage={ROWS_PER_PAGE}
        rowsPerPageOptions={[]}
        onPageChange={(_event, next) => setPage(next)}
        labelDisplayedRows={({ from, to, count }) => `${from} to ${to} of ${count} items`}
      />
      <ResultStatus
        total={rows.length}
        page={currentPage}
        rowsPerPage={ROWS_PER_PAGE}
        nouns={kind === 'expense' ? ['expense', 'expenses'] : ['earning', 'earnings']}
      />
    </Stack>
  );
}

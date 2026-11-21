import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
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
  Typography,
  type SvgIconProps,
} from '@mui/material';
import type { Kind, LineView, SortDir } from '../api/types';
import { formatEuro, formatRowDate } from '../format/format';

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

export type LineTableProps = {
  kind: Kind;
  lines: LineView[];
  canEdit: boolean;
  onView: (line: LineView) => void;
  onEdit: (line: LineView) => void;
  onDelete: (line: LineView) => void;
  actions?: ReactNode;
};

type SortKey = 'date' | 'title' | 'description' | 'amountInEuros' | 'typeLabel';

type SortState = { key: SortKey; dir: SortDir } | null;

type Column = { key: SortKey; label: string; align?: 'right' };

const ROWS_PER_PAGE = 10;
const COLUMN_COUNT = 6;

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

function columnsFor(kind: Kind): Column[] {
  const isExpense = kind === 'expense';
  return [
    { key: 'date', label: 'Date' },
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'amountInEuros', label: isExpense ? 'Amount Spent' : 'Amount Earned', align: 'right' },
    { key: 'typeLabel', label: isExpense ? 'Expense Type' : 'Earning Type' },
  ];
}

export function LineTable({
  kind,
  lines,
  canEdit,
  onView,
  onEdit,
  onDelete,
  actions,
}: LineTableProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [search, lines]);

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
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: { sm: '20rem' } }}
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
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label={kind === 'expense' ? 'Expenses' : 'Earnings'}>
          <TableHead>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <TableCell
                    key={column.key}
                    align={column.align}
                    sortDirection={active ? sort.dir : false}
                  >
                    <TableSortLabel
                      active={active}
                      direction={active ? sort.dir : 'asc'}
                      onClick={() => toggleSort(column.key)}
                      sx={{
                        '&.Mui-focusVisible': {
                          outline: 2,
                          outlineColor: 'primary.main',
                          outlineOffset: 2,
                          borderRadius: 0.5,
                        },
                      }}
                    >
                      {column.label}
                    </TableSortLabel>
                  </TableCell>
                );
              })}
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No records available
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((line) => (
                <TableRow key={line.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatRowDate(line.date)}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{line.title ?? ''}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{line.description ?? ''}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {formatEuro(line.amountInEuros)}
                  </TableCell>
                  <TableCell>{line.typeLabel ?? ''}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} useFlexGap justifyContent="center">
                      <IconButton aria-label="View" color="primary" onClick={() => onView(line)}>
                        <ViewIcon />
                      </IconButton>
                      {canEdit && (
                        <IconButton aria-label="Edit" color="primary" onClick={() => onEdit(line)}>
                          <EditIcon />
                        </IconButton>
                      )}
                      {canEdit && (
                        <IconButton
                          aria-label="Delete"
                          color="primary"
                          onClick={() => onDelete(line)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={rows.length}
        page={currentPage}
        rowsPerPage={ROWS_PER_PAGE}
        rowsPerPageOptions={[]}
        onPageChange={(_event, next) => setPage(next)}
        labelDisplayedRows={({ from, to, count }) => `${from} to ${to} of ${count} items`}
      />
    </Stack>
  );
}

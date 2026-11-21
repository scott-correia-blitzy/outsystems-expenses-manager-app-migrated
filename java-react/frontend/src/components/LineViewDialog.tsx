import { useId, type ReactNode } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Stack,
  SvgIcon,
  Typography,
  type SvgIconProps,
} from '@mui/material';
import { invoiceDownloadUrl } from '../api/api';
import { MESSAGES, type InvoiceInfo, type Kind, type LineView } from '../api/types';
import { formatEuro, formatIsoDate } from '../format/format';

export type LineViewDialogProps = {
  open: boolean;
  kind: Kind;
  line: LineView;
  vatRate: number;
  onClose: () => void;
  onEdit?: () => void;
};

type DetailRow = { label: string; value: ReactNode };

function CloseIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </SvgIcon>
  );
}

function DocumentIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z" />
    </SvgIcon>
  );
}

function DownloadIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 20h14v-2H5zM19 9h-4V3H9v6H5l7 7z" />
    </SvgIcon>
  );
}

export function vatLabel(vatRate: number): string {
  return Number.isFinite(vatRate) ? `VAT (${Math.round(vatRate * 10000) / 100}%)` : 'VAT';
}

function detailRows(kind: Kind, line: LineView): DetailRow[] {
  const rows: DetailRow[] = [
    { label: 'Date', value: formatIsoDate(line.date) },
    { label: 'Title', value: line.title },
    { label: 'Description', value: line.description ?? '' },
    { label: kind === 'expense' ? 'Expense Type' : 'Earning Type', value: line.typeLabel },
  ];
  if (line.kilometers != null) {
    rows.push({ label: 'Distance', value: `${line.kilometers} km` });
  }
  return rows;
}

function InvoicePanel({ invoice, downloadUrl }: { invoice: InvoiceInfo | null; downloadUrl: string }) {
  if (!invoice) {
    return (
      <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', paddingBlock: 4 }}>
        <DocumentIcon sx={{ fontSize: (theme) => theme.spacing(12), color: 'grey.300' }} />
        <Typography color="text.secondary">{MESSAGES.NO_INVOICE}</Typography>
      </Stack>
    );
  }
  const isImage = (invoice.contentType ?? '').startsWith('image/');
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      {isImage && (
        <Box
          component="img"
          src={downloadUrl}
          alt={`Invoice ${invoice.filename}`}
          decoding="async"
          sx={{
            display: 'block',
            maxInlineSize: '100%',
            maxBlockSize: (theme) => theme.spacing(50),
            objectFit: 'contain',
            borderRadius: 1,
            bgcolor: 'grey.50',
          }}
        />
      )}
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
        {invoice.filename}
      </Typography>
      <Button variant="contained" href={downloadUrl} startIcon={<DownloadIcon />}>
        Download Invoice
      </Button>
    </Stack>
  );
}

export function LineViewDialog({ open, kind, line, vatRate, onClose, onEdit }: LineViewDialogProps) {
  const titleId = useId();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth aria-labelledby={titleId}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', justifyContent: 'space-between', paddingInlineEnd: 2 }}
      >
        <DialogTitle id={titleId} variant="h5" sx={{ overflowWrap: 'anywhere' }}>
          {line.title}
        </DialogTitle>
        <IconButton aria-label="Close" color="primary" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <DialogContent>
        <Paper variant="outlined">
          <Box sx={{ p: 3 }}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h3">
                    Details
                  </Typography>
                  <Box component="dl" sx={{ m: 0 }}>
                    {detailRows(kind, line).map((row) => (
                      // A border rather than Divider, which renders an hr that a dl may not contain.
                      <Box
                        key={row.label}
                        sx={{
                          paddingBlock: 1.5,
                          borderBlockEndStyle: 'solid',
                          borderBlockEndWidth: 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography component="dt" variant="subtitle2">
                          {row.label}
                        </Typography>
                        <Typography
                          component="dd"
                          variant="body1"
                          sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }}
                        >
                          {row.value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Stack
                    spacing={1}
                    sx={{ alignSelf: 'flex-start', bgcolor: 'grey.50', p: 2, borderRadius: 1 }}
                  >
                    <Typography variant="body2">Total:</Typography>
                    <Typography variant="h4" component="p" sx={{ fontWeight: 'fontWeightBold' }}>
                      {formatEuro(line.amountInEuros)}
                    </Typography>
                    <Typography variant="body2">{`${vatLabel(vatRate)}: ${formatEuro(line.vat)}`}</Typography>
                  </Stack>
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h3">
                    Invoice
                  </Typography>
                  <InvoicePanel invoice={line.invoice} downloadUrl={invoiceDownloadUrl(kind, line.id)} />
                </Stack>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </DialogContent>
      {onEdit && (
        <DialogActions>
          <Button variant="outlined" onClick={onEdit}>
            Edit Details
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}

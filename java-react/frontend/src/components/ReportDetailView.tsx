import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Grid, IconButton, Stack } from '@mui/material';
import { useNavigate } from 'react-router';
import { decideReport, deleteLine, deleteReport, getReport, reference, submitReport } from '../api/api';
import {
  ApiError,
  MESSAGES,
  type Kind,
  type LineView,
  type ReferenceData,
  type ReportDetail,
} from '../api/types';
import { formatCreatedAt, formatEuro } from '../format/format';
import { PageHeader } from '../layout/PageHeader';
import { PATHS } from '../routes';
import { ConfirmDialog } from './ConfirmDialog';
import { useFeedback } from './Feedback';
import { KpiCard } from './KpiCard';
import { LineFormDialog } from './LineFormDialog';
import { DeleteIcon, LineTable } from './LineTable';
import { LineViewDialog } from './LineViewDialog';
import { StatusTag } from './StatusTag';

export type ReportDetailMode = 'owner' | 'admin';

export type ReportDetailViewProps = {
  kind: Kind;
  mode: ReportDetailMode;
  id: string | undefined;
};

type PendingAction = 'submit' | 'approve' | 'decline';

type LineDialog = { open: boolean; line?: LineView };

type LoadedReport = { kind: Kind; id: number; detail: ReportDetail };

const CLOSED_DIALOG: LineDialog = { open: false };

const LABELS: Record<Kind, { noun: string; total: string; addLine: string; deleteLine: string }> = {
  expense: {
    noun: 'Expense',
    total: 'Total Expenses',
    addLine: 'Add Expense',
    deleteLine: 'Delete Expense',
  },
  earning: {
    noun: 'Earning',
    total: 'Total Earnings',
    addLine: 'Add Earning',
    deleteLine: 'Delete Earning',
  },
};

function parseReportId(id: string | undefined): number | null {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function hidden(dialog: LineDialog): LineDialog {
  return { ...dialog, open: false };
}

export function ReportDetailView({ kind, mode, id }: ReportDetailViewProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const reportId = parseReportId(id);
  const [loaded, setLoaded] = useState<LoadedReport | null>(null);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [lineForm, setLineForm] = useState<LineDialog>(CLOSED_DIALOG);
  const [lineView, setLineView] = useState<LineDialog>(CLOSED_DIALOG);
  const [lineToDelete, setLineToDelete] = useState<LineView | null>(null);
  const [reportDeleteOpen, setReportDeleteOpen] = useState(false);
  const latestLoad = useRef(0);

  const rejectInvalidReport = useCallback(() => {
    feedback.warning(MESSAGES.INVALID_REPORT);
    // All legacy detail screens, admin and earning ones too, fall back to the user dashboard.
    navigate(PATHS.dashboard, { replace: true });
  }, [feedback, navigate]);

  const load = useCallback(async () => {
    if (reportId === null) {
      return;
    }
    latestLoad.current += 1;
    const loadId = latestLoad.current;
    try {
      const detail = await getReport(kind, reportId);
      if (loadId === latestLoad.current) {
        setLoaded({ kind, id: reportId, detail });
      }
    } catch (err) {
      if (loadId !== latestLoad.current) {
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        rejectInvalidReport();
      } else {
        feedback.error(err);
      }
    }
  }, [kind, reportId, feedback, rejectInvalidReport]);

  useEffect(() => {
    if (reportId === null) {
      rejectInvalidReport();
      return undefined;
    }
    void load();
    return () => {
      latestLoad.current += 1;
    };
  }, [reportId, load, rejectInvalidReport]);

  useEffect(() => {
    let active = true;
    reference().then(
      (data) => {
        if (active) {
          setReferenceData(data);
        }
      },
      (err: unknown) => {
        if (active) {
          feedback.error(err);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [feedback]);

  const report = loaded !== null && loaded.kind === kind && loaded.id === reportId ? loaded.detail : null;

  if (report === null) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ paddingBlock: 8 }}>
        <CircularProgress aria-label="Loading" />
      </Stack>
    );
  }

  const labels = LABELS[kind];
  const canEdit = mode === 'owner' && report.status === 'Draft';
  const canDecide = mode === 'admin' && report.status === 'Submitted';
  const busy = pending !== null;
  const viewedLine = lineView.line;

  const runReportAction = async (action: PendingAction, send: () => Promise<unknown>, success: string) => {
    setPending(action);
    try {
      await send();
    } catch (err) {
      setPending(null);
      feedback.error(err);
      return;
    }
    feedback.success(success);
    await load();
    setPending(null);
  };

  const submit = () =>
    runReportAction('submit', () => submitReport(kind, report.id), `${labels.noun} report was submitted`);

  const decide = (accept: boolean) =>
    runReportAction(
      accept ? 'approve' : 'decline',
      () => decideReport(kind, report.id, accept),
      `${labels.noun} report was ${accept ? 'approved' : 'declined'}`,
    );

  const confirmReportDelete = async () => {
    try {
      await deleteReport(kind, report.id);
    } catch (err) {
      setReportDeleteOpen(false);
      feedback.error(err);
      return;
    }
    setReportDeleteOpen(false);
    feedback.success(`${labels.noun} report was deleted`);
    navigate(PATHS.reports);
  };

  const confirmLineDelete = async () => {
    if (lineToDelete === null) {
      return;
    }
    try {
      await deleteLine(kind, lineToDelete.id);
    } catch (err) {
      setLineToDelete(null);
      feedback.error(err);
      return;
    }
    setLineToDelete(null);
    feedback.success(`${labels.noun} was deleted`);
    void load();
  };

  const handleLineSaved = () => {
    setLineForm(hidden);
    void load();
  };

  const editFromView = (line: LineView) => {
    setLineView(hidden);
    setLineForm({ open: true, line });
  };

  const breadcrumbs =
    mode === 'owner'
      ? [{ label: 'Home', to: '/' }, { label: 'Reports', to: PATHS.reports }]
      : [{ label: 'Home', to: '/' }, { label: 'Dashboard', to: PATHS.admin }];

  let actions: ReactNode = null;
  if (canEdit) {
    actions = (
      <>
        <Button
          variant="contained"
          loading={pending === 'submit'}
          disabled={busy}
          onClick={() => void submit()}
        >
          Submit Report
        </Button>
        <IconButton
          aria-label="Delete Report"
          color="error"
          disabled={busy}
          onClick={() => setReportDeleteOpen(true)}
        >
          <DeleteIcon />
        </IconButton>
      </>
    );
  } else if (canDecide) {
    actions = (
      <>
        <Button
          variant="contained"
          color="success"
          loading={pending === 'approve'}
          disabled={busy}
          onClick={() => void decide(true)}
        >
          Approve Report
        </Button>
        <Button
          variant="contained"
          color="error"
          loading={pending === 'decline'}
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Decline Report
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[...breadcrumbs, { label: `Report Detail - ${report.title}` }]}
        title={`${report.code}: ${report.title}`}
        subtitle={
          <Stack
            component="span"
            direction="row"
            spacing={1}
            useFlexGap
            alignItems="center"
            flexWrap="wrap"
          >
            <StatusTag status={report.status} />
            <Box component="span">
              {`Created by ${report.createdByName ?? ''} at ${formatCreatedAt(report.createdOn)}`}
            </Box>
          </Stack>
        }
        actions={actions}
      />
      <Stack spacing={3} useFlexGap>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <KpiCard label={labels.total} value={formatEuro(report.totalEur)} />
          </Grid>
        </Grid>
        <LineTable
          kind={kind}
          lines={report.lines}
          canEdit={canEdit}
          onView={(line) => setLineView({ open: true, line })}
          onEdit={(line) => setLineForm({ open: true, line })}
          onDelete={setLineToDelete}
          actions={
            canEdit ? (
              <Button variant="contained" disabled={busy} onClick={() => setLineForm({ open: true })}>
                {labels.addLine}
              </Button>
            ) : undefined
          }
        />
      </Stack>
      {referenceData && (
        <LineFormDialog
          open={lineForm.open}
          kind={kind}
          report={{ id: report.id, title: report.title }}
          line={lineForm.line}
          reference={referenceData}
          onClose={() => setLineForm(hidden)}
          onSaved={handleLineSaved}
        />
      )}
      {viewedLine && referenceData && (
        <LineViewDialog
          open={lineView.open}
          kind={kind}
          line={viewedLine}
          vatRate={referenceData.vatRate}
          onClose={() => setLineView(hidden)}
          onEdit={canEdit ? () => editFromView(viewedLine) : undefined}
        />
      )}
      <ConfirmDialog
        open={lineToDelete !== null}
        title={labels.deleteLine}
        message="Are you sure you want to delete this permanently?"
        onConfirm={confirmLineDelete}
        onClose={() => setLineToDelete(null)}
      />
      <ConfirmDialog
        open={reportDeleteOpen}
        title="Delete Report"
        message="Are you sure you want to delete this report permanently?"
        onConfirm={confirmReportDelete}
        onClose={() => setReportDeleteOpen(false)}
      />
    </>
  );
}

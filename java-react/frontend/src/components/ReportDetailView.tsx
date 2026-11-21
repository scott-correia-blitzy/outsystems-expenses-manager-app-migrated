import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, IconButton, Stack } from '@mui/material';
import { useNavigate } from 'react-router';
import {
  decideReport,
  deleteLine,
  deleteReport,
  getReport,
  listReports,
  reference,
  submitReport,
} from '../api/api';
import {
  ApiError,
  MESSAGES,
  type Kind,
  type LineView,
  type ReferenceData,
  type ReportDetail,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
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

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
  | { phase: 'ready'; detail: ReportDetail; owned: boolean };

type ReferenceState =
  | { phase: 'loading' }
  | { phase: 'error'; error: unknown }
  | { phase: 'ready'; data: ReferenceData };

type ReportDetailContentProps = ReportDetailViewProps & {
  referenceState: ReferenceState;
  onRetryReference: () => void;
};

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

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : MESSAGES.GENERIC_ERROR;
}

export function ReportDetailView({ kind, mode, id }: ReportDetailViewProps) {
  const [referenceState, setReferenceState] = useState<ReferenceState>({ phase: 'loading' });
  const latestReference = useRef(0);

  const fetchReference = useCallback(() => {
    latestReference.current += 1;
    const requestId = latestReference.current;
    reference().then(
      (data) => {
        if (requestId === latestReference.current) {
          setReferenceState({ phase: 'ready', data });
        }
      },
      (error: unknown) => {
        if (requestId === latestReference.current) {
          setReferenceState({ phase: 'error', error });
        }
      },
    );
  }, []);

  useEffect(() => {
    fetchReference();
    return () => {
      latestReference.current += 1;
    };
  }, [fetchReference]);

  const retryReference = useCallback(() => {
    setReferenceState({ phase: 'loading' });
    fetchReference();
  }, [fetchReference]);

  // Keyed by report identity so dialogs, pending actions and loads never carry over to another report.
  return (
    <ReportDetailContent
      key={`${kind}/${id ?? ''}`}
      kind={kind}
      mode={mode}
      id={id}
      referenceState={referenceState}
      onRetryReference={retryReference}
    />
  );
}

function ReportDetailContent({
  kind,
  mode,
  id,
  referenceState,
  onRetryReference,
}: ReportDetailContentProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const isAdministrator = useAuth().hasRole('Administrator');
  const reportId = parseReportId(id);
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'loading' });
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [lineForm, setLineForm] = useState<LineDialog>(CLOSED_DIALOG);
  const [lineView, setLineView] = useState<LineDialog>(CLOSED_DIALOG);
  const [lineToDelete, setLineToDelete] = useState<LineView | null>(null);
  const [reportDeleteOpen, setReportDeleteOpen] = useState(false);
  const latestLoad = useRef(0);
  const reportShown = useRef(false);
  const ownership = useRef<boolean | null>(null);
  const alive = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rejectInvalidReport = useCallback(() => {
    feedback.warning(MESSAGES.INVALID_REPORT);
    // All legacy detail screens, admin and earning ones too, fall back to the user dashboard.
    navigate(PATHS.dashboard, { replace: true });
  }, [feedback, navigate]);

  // The detail body names no owner: a successful read by a caller without Administrator proves ownership,
  // and the Draft list returns an administrator only the Drafts they own.
  const resolveOwnership = useCallback(
    async (detail: ReportDetail): Promise<boolean> => {
      if (mode !== 'owner') {
        return false;
      }
      if (!isAdministrator) {
        return true;
      }
      if (ownership.current !== null) {
        return ownership.current;
      }
      if (detail.status !== 'Draft') {
        return false;
      }
      const drafts = await listReports({ kind, status: 'Draft', q: detail.code });
      ownership.current = drafts.some((row) => row.id === detail.id);
      return ownership.current;
    },
    [kind, mode, isAdministrator],
  );

  const load = useCallback(async () => {
    if (reportId === null) {
      return;
    }
    latestLoad.current += 1;
    const loadId = latestLoad.current;
    try {
      const detail = await getReport(kind, reportId);
      const owned = await resolveOwnership(detail);
      if (loadId === latestLoad.current) {
        reportShown.current = true;
        setLoadState({ phase: 'ready', detail, owned });
      }
    } catch (err) {
      if (loadId !== latestLoad.current) {
        return;
      }
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
        rejectInvalidReport();
      } else if (reportShown.current) {
        feedback.error(err);
      } else {
        setLoadState({ phase: 'error', error: err });
      }
    }
  }, [kind, reportId, feedback, rejectInvalidReport, resolveOwnership]);

  const retryLoad = () => {
    setLoadState({ phase: 'loading' });
    void load();
  };

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

  const referenceData = referenceState.phase === 'ready' ? referenceState.data : null;
  const referenceFailed = referenceState.phase === 'error';

  // A line dialog requested while the reference data was loading must not pop up after a later retry.
  useEffect(() => {
    if (referenceFailed) {
      setLineForm(CLOSED_DIALOG);
      setLineView(CLOSED_DIALOG);
    }
  }, [referenceFailed]);

  if (loadState.phase === 'loading') {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ paddingBlock: 8 }}>
        <CircularProgress aria-label="Loading" />
      </Stack>
    );
  }

  if (loadState.phase === 'error') {
    return (
      <Stack sx={{ paddingBlock: 3 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retryLoad}>
              Retry
            </Button>
          }
        >
          {errorMessage(loadState.error)}
        </Alert>
      </Stack>
    );
  }

  const report = loadState.detail;
  const labels = LABELS[kind];
  const canEdit = mode === 'owner' && loadState.owned && report.status === 'Draft';
  const canDecide = mode === 'admin' && report.status === 'Submitted';
  const busy = pending !== null;
  const viewedLine = lineView.line;

  const runReportAction = async (action: PendingAction, send: () => Promise<unknown>, success: string) => {
    setPending(action);
    try {
      await send();
    } catch (err) {
      feedback.error(err);
      if (alive.current) {
        setPending(null);
      }
      return;
    }
    feedback.success(success);
    if (!alive.current) {
      return;
    }
    await load();
    if (alive.current) {
      setPending(null);
    }
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
      feedback.error(err);
      if (alive.current) {
        setReportDeleteOpen(false);
      }
      return;
    }
    feedback.success(`${labels.noun} report was deleted`);
    if (!alive.current) {
      return;
    }
    setReportDeleteOpen(false);
    navigate(PATHS.reports);
  };

  const confirmLineDelete = async () => {
    if (lineToDelete === null) {
      return;
    }
    try {
      await deleteLine(kind, lineToDelete.id);
    } catch (err) {
      feedback.error(err);
      if (alive.current) {
        setLineToDelete(null);
      }
      return;
    }
    feedback.success(`${labels.noun} was deleted`);
    if (!alive.current) {
      return;
    }
    setLineToDelete(null);
    void load();
  };

  const handleLineSaved = () => {
    if (!alive.current) {
      return;
    }
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
        {referenceState.phase === 'error' && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={onRetryReference}>
                Retry
              </Button>
            }
          >
            {errorMessage(referenceState.error)}
          </Alert>
        )}
        <LineTable
          kind={kind}
          lines={report.lines}
          canEdit={canEdit}
          viewDisabled={referenceFailed}
          editDisabled={busy || referenceFailed}
          deleteDisabled={busy}
          onView={(line) => setLineView({ open: true, line })}
          onEdit={(line) => setLineForm({ open: true, line })}
          onDelete={setLineToDelete}
          actions={
            canEdit ? (
              <Button
                variant="contained"
                disabled={busy || referenceFailed}
                onClick={() => setLineForm({ open: true })}
              >
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
          onEdit={canEdit && !busy ? () => editFromView(viewedLine) : undefined}
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

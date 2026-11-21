import { useState, type MouseEvent } from 'react';
import { Button, Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import type { Kind } from '../api/types';
import { NewReportDialog } from '../components/NewReportDialog';
import { ReportList } from '../components/ReportList';
import { PageHeader } from '../layout/PageHeader';

const BREADCRUMBS = [{ label: 'Home', to: '/' }, { label: 'Reports' }];

export function UserReportsPage() {
  const [kind, setKind] = useState<Kind>('expense');
  const [dialogOpen, setDialogOpen] = useState(false);

  // The group emits null when the selected button is pressed again, which must not clear the kind.
  const changeKind = (_event: MouseEvent<HTMLElement>, next: Kind | null) => {
    if (next !== null) {
      setKind(next);
    }
  };

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Browse your reports"
        breadcrumbs={BREADCRUMBS}
        actions={
          <Button variant="contained" onClick={() => setDialogOpen(true)}>
            New Report
          </Button>
        }
      />
      <Stack spacing={2} useFlexGap>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={kind}
          onChange={changeKind}
          aria-label="Report type"
          sx={{ alignSelf: 'flex-start' }}
        >
          <ToggleButton value="expense">Expenses</ToggleButton>
          <ToggleButton value="earning">Earnings</ToggleButton>
        </ToggleButtonGroup>
        <ReportList mode="user" kind={kind} />
      </Stack>
      <NewReportDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

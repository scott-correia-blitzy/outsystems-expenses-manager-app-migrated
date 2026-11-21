import { Button, Card, CardContent, Container, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../layout/PageHeader';
import { PATHS } from '../routes';

export function InvalidPermissionsPage() {
  const navigate = useNavigate();
  const { status } = useAuth();
  const anonymous = status === 'anonymous';
  // AppLayout provides the main landmark only for signed-in callers.
  const landmark = anonymous ? 'main' : 'div';

  return (
    <Container component={landmark} maxWidth="sm" sx={{ py: 4 }}>
      <Card>
        <CardContent>
          <PageHeader title="You don't have permissions to view this screen." />
          <Stack spacing={3}>
            <Typography variant="body1">Please contact your system administrator.</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button variant="contained" onClick={() => navigate(-1)}>
                Go Back
              </Button>
              {anonymous && (
                <Button variant="contained" component={RouterLink} to={PATHS.login}>
                  Login
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}

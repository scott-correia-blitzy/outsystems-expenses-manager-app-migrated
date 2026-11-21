import type { ReactNode } from 'react';
import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { expect } from 'vitest';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, useLocation } from 'react-router';
import { theme } from '../theme/theme';
import { AuthProvider } from '../auth/AuthContext';
import { FeedbackProvider } from '../components/Feedback';
import { AppRoutes } from '../routes';
import { installApiMocks, type SessionCategory } from './fixtures';

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

export function renderRoute(path: string | string[], category: SessionCategory, probe?: ReactNode): RenderResult {
  installApiMocks(category);
  return render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <FeedbackProvider>
          <MemoryRouter initialEntries={typeof path === 'string' ? [path] : path} useTransitions={false}>
            <AppRoutes />
            {/* Outside the route tree, so it shows where every redirect ends up. */}
            <LocationProbe />
            {probe}
          </MemoryRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ThemeProvider>,
  );
}

export async function expectLocation(expected: string): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(expected));
}

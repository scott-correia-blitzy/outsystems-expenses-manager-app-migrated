import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { BrowserRouter } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { FeedbackProvider } from './components/Feedback';
import { AppRoutes } from './routes';
import { theme } from './theme/theme';

export function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <FeedbackProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

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
          {/* Without transitions a navigation commits with the session change before it, so no guard paints a blank screen. */}
          <BrowserRouter useTransitions={false}>
            <AppRoutes />
          </BrowserRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

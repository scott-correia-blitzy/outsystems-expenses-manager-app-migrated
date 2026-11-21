import { createTheme } from '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    nav: Palette['primary'];
    accent: Palette['primary'];
  }
  interface PaletteOptions {
    nav?: PaletteOptions['primary'];
    accent?: PaletteOptions['primary'];
  }
}

const brandTertiary = '#002E6B';
const gray200 = '#C6C6C6';
const gray500 = '#767676';

const bodyFont = '"Lato", Helvetica, Arial, sans-serif';
const headingFont = '"MMSharpSans", Helvetica, Arial, sans-serif';

const base = createTheme({
  palette: {
    primary: { main: '#004DB2', dark: brandTertiary },
    secondary: { main: '#003D8C' },
    info: { main: brandTertiary },
    success: { main: '#327320' },
    warning: { main: '#DB7C0F' },
    error: { main: '#E21224' },
    text: { primary: 'rgba(0, 0, 0, 0.85)', secondary: '#555555', disabled: gray500 },
    divider: gray200,
    background: { paper: '#FFFFFF', default: '#F8F8F8' },
    grey: {
      50: '#F1F1F1',
      100: '#E2E2E2',
      200: gray200,
      300: '#ABABAB',
      400: '#919191',
      500: gray500,
      600: '#5E5E5E',
      700: '#474747',
      800: '#303030',
      900: '#1B1B1B',
    },
  },
  typography: {
    fontFamily: bodyFont,
    h1: { fontFamily: headingFont },
    h2: { fontFamily: headingFont },
    h3: { fontFamily: headingFont },
    h4: { fontFamily: headingFont },
    h5: { fontFamily: headingFont },
    h6: { fontFamily: headingFont },
    button: { fontFamily: headingFont },
  },
  // The brand site sets html{font-size:62.5%}, so its rem tokens are given in px; the pill radius keeps its CSS value.
  shape: { borderRadius: 8 },
  spacing: 8,
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: '9999rem' } } },
    MuiAppBar: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: theme.palette.nav.main,
          color: theme.palette.nav.contrastText,
        }),
      },
    },
  },
});

export const theme = createTheme(base, {
  palette: {
    nav: base.palette.augmentColor({ color: { main: '#002452' }, name: 'nav' }),
    accent: base.palette.augmentColor({ color: { main: '#72D3EF' }, name: 'accent' }),
  },
});

export default theme;

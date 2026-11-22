import { createTheme, type Theme } from '@mui/material/styles';

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
const textPrimary = 'rgba(0, 0, 0, 0.85)';

const bodyFont = '"Lato", Helvetica, Arial, sans-serif';
const headingFont = '"MMSharpSans", Helvetica, Arial, sans-serif';
const touchTarget = 5.5;

const focusRing = (theme: Theme) => ({ outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 });

const base = createTheme({
  palette: {
    primary: { main: '#004DB2', dark: brandTertiary },
    secondary: { main: '#003D8C' },
    info: { main: brandTertiary },
    success: { main: '#327320' },
    warning: { main: '#DB7C0F', contrastText: textPrimary },
    error: { main: '#E21224' },
    text: { primary: textPrimary, secondary: '#555555', disabled: gray500 },
    action: { disabled: gray500 },
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
    button: { fontFamily: headingFont, textTransform: 'none' },
  },
  // The brand site sets html{font-size:62.5%}, so its rem tokens are given in px; the pill radius keeps its CSS value.
  shape: { borderRadius: 8 },
  spacing: 8,
  components: {
    MuiButton: {
      styleOverrides: {
        root: ({ theme }) => ({ borderRadius: '9999rem', minHeight: theme.spacing(touchTarget) }),
        // MUI's ripple takes the label colour and paints over the label, so on a fill it would drop below AA contrast.
        contained: ({ theme }) => ({
          isolation: 'isolate',
          '& .MuiTouchRipple-root': { color: theme.palette.common.black, zIndex: -1 },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({ minWidth: theme.spacing(touchTarget), minHeight: theme.spacing(touchTarget) }),
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': focusRing(theme),
        }),
      },
    },
    // Link renders a Typography, so this also rings breadcrumb links; headings take focus on navigation.
    MuiTypography: { styleOverrides: { root: ({ theme }) => ({ '&:focus-visible': focusRing(theme) }) } },
    // Neighbours paint over these rings and their containers clip them, so the rings are raised, inset or rounded.
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': { zIndex: 1 },
          minWidth: theme.spacing(touchTarget),
          minHeight: theme.spacing(touchTarget),
        }),
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': { outlineOffset: -2 },
          [theme.breakpoints.up('sm')]: { minHeight: theme.spacing(touchTarget) },
        }),
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': { outlineOffset: -2 },
          minWidth: theme.spacing(touchTarget),
          minHeight: theme.spacing(touchTarget),
        }),
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': { outlineOffset: -2, zIndex: 1, borderRadius: theme.shape.borderRadius },
        }),
      },
    },
    MuiTablePagination: {
      styleOverrides: { actions: { '& .MuiButtonBase-root.Mui-focusVisible': { outlineOffset: -2 } } },
    },
    MuiTableCell: {
      styleOverrides: { root: ({ theme }) => ({ borderBottomColor: theme.palette.divider }) },
    },
    // MUI fades placeholders below AA contrast, and they are the search fields' only visible label.
    MuiInputBase: {
      styleOverrides: {
        input: ({ theme }) => ({ '&::placeholder': { color: theme.palette.text.secondary, opacity: 1 } }),
      },
    },
    MuiAvatar: {
      styleOverrides: {
        colorDefault: ({ theme }) => ({
          color: theme.palette.common.white,
          backgroundColor: theme.palette.grey[600],
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        // MUI's resting outline, also restored by its touch-screen hover reset, falls below 3:1 contrast.
        root: ({ theme }) => ({
          '@media (hover: none)': {
            '&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline': {
              borderColor: theme.palette.grey[500],
            },
          },
        }),
        notchedOutline: ({ theme }) => ({ borderColor: theme.palette.grey[500] }),
        // 1.4375em is the input's line box, so equal padding centres it in the touch target.
        input: ({ ownerState, theme }) =>
          ownerState.size === 'small' && !ownerState.multiline
            ? { paddingBlock: `calc((${theme.spacing(touchTarget)} - 1.4375em) / 2)` }
            : {},
      },
    },
    // Filled alerts ignore contrastText and pick white, which falls below AA contrast on the brand orange.
    MuiAlert: {
      variants: [
        {
          props: ({ variant, color, severity }) =>
            variant === 'filled' && (color ?? severity) === 'warning',
          style: ({ theme }) => ({ color: theme.palette.warning.contrastText }),
        },
        // The primary ring falls below 3:1 on the filled colours, so controls there ring in their text colour.
        {
          props: { variant: 'filled' },
          style: { '& .MuiButtonBase-root.Mui-focusVisible': { outlineColor: 'currentColor' } },
        },
        // A touch-sized action overlaps the message padding to centre on line one; this keeps fill around its ring.
        {
          props: ({ action, onClose }) => action != null || onClose != null,
          style: ({ theme }) => ({ paddingBlock: theme.spacing(1.25) }),
        },
      ],
      styleOverrides: { action: ({ theme }) => ({ paddingTop: 0, marginBlock: theme.spacing(-0.5) }) },
    },
    MuiAppBar: {
      styleOverrides: {
        // The default hover and disabled colours are dark tints, which vanish on the navy bar.
        root: ({ theme }) => ({
          backgroundColor: theme.palette.nav.main,
          color: theme.palette.nav.contrastText,
          '@media (hover: hover)': {
            '& .MuiButtonBase-root:hover': { backgroundColor: theme.alpha(theme.palette.nav.contrastText, 0.12) },
          },
          '& .MuiButtonBase-root.Mui-disabled': { color: theme.alpha(theme.palette.nav.contrastText, 0.5) },
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

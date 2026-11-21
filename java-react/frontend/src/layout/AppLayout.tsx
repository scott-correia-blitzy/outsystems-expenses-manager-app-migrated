import { useId, useState, type MouseEvent, type ReactNode } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Container,
  IconButton,
  Menu,
  MenuItem as MuiMenuItem,
  Stack,
  SvgIcon,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { menuFor, PATHS, type MenuItem as NavItem } from '../routes';

const MAIN_ID = 'main-content';

function LogoutIcon() {
  return (
    <SvgIcon fontSize="small">
      <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
    </SvgIcon>
  );
}

function ChevronDown() {
  return (
    <SvgIcon fontSize="small">
      <path d="M7 10l5 5 5-5z" />
    </SvgIcon>
  );
}

function initials(displayName: string, username: string): string {
  const fromName = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return fromName || username.trim().charAt(0).toUpperCase();
}

function isActive(pathname: string, path: string | undefined): boolean {
  return path !== undefined && (pathname === path || pathname.startsWith(`${path}/`));
}

// MUI's focus ripple alone falls below 3:1 contrast on the navy bar.
const barFocusRing = {
  '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 2 },
} as const;

function navSx(active: boolean) {
  return {
    ...barFocusRing,
    borderRadius: 0,
    borderBottom: 2,
    borderColor: active ? 'accent.main' : 'transparent',
    textTransform: 'none',
  } as const;
}

function NavDropdown({ label, items, pathname }: { label: string; items: readonly NavItem[]; pathname: string }) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonId = useId();
  const menuId = useId();
  const open = anchorEl !== null;
  const close = () => setAnchorEl(null);
  const active = items.some((child) => isActive(pathname, child.path));

  return (
    <>
      <Button
        color="inherit"
        id={buttonId}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open ? 'true' : undefined}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
        endIcon={<ChevronDown />}
        sx={navSx(active)}
      >
        {label}
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        slotProps={{ list: { 'aria-labelledby': buttonId } }}
      >
        {items.map((child) =>
          child.path === undefined ? null : (
            <MuiMenuItem
              key={child.path}
              component={RouterLink}
              to={child.path}
              selected={isActive(pathname, child.path)}
              onClick={close}
            >
              {child.label}
            </MuiMenuItem>
          ),
        )}
      </Menu>
    </>
  );
}

function NavEntry({ item, pathname }: { item: NavItem; pathname: string }) {
  if (item.children !== undefined) {
    return <NavDropdown label={item.label} items={item.children} pathname={pathname} />;
  }
  if (item.path === undefined) {
    return null;
  }
  const active = isActive(pathname, item.path);
  return (
    <Button
      component={RouterLink}
      to={item.path}
      color="inherit"
      aria-current={active ? 'page' : undefined}
      sx={navSx(active)}
    >
      {item.label}
    </Button>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    void logout().then((ended) => {
      if (ended) {
        // Open pages such as Invalid Permissions do not redirect an anonymous visitor to Login.
        navigate(PATHS.login, { replace: true });
      } else {
        setLoggingOut(false);
      }
    });
  };

  return (
    <Stack sx={{ minHeight: '100vh' }}>
      <Button
        href={`#${MAIN_ID}`}
        variant="contained"
        sx={{
          position: 'absolute',
          insetInlineStart: (theme) => theme.spacing(2),
          insetBlockStart: (theme) => theme.spacing(1),
          zIndex: 'tooltip',
          transform: 'translateY(-200%)',
          '&:focus-visible': { transform: 'none' },
        }}
      >
        Skip to main content
      </Button>
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            color="inherit"
            noWrap
            sx={{ ...barFocusRing, textDecoration: 'none', fontWeight: 'fontWeightBold' }}
          >
            Expenses Manager V2
          </Typography>
          {user !== null && (
            <>
              <Stack
                component="nav"
                aria-label="Main menu"
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ flexGrow: 1, flexWrap: 'wrap' }}
              >
                {menuFor(user.roles).map((item) => (
                  <NavEntry key={item.label} item={item} pathname={pathname} />
                ))}
              </Stack>
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                alignItems="center"
                sx={{ minWidth: 0, maxWidth: '100%' }}
              >
                <Avatar
                  aria-hidden="true"
                  sx={{
                    flexShrink: 0,
                    width: (theme) => theme.spacing(4),
                    height: (theme) => theme.spacing(4),
                    typography: 'body2',
                  }}
                >
                  {initials(user.displayName, user.username)}
                </Avatar>
                <Typography variant="body2" color="inherit" noWrap sx={{ minWidth: 0 }}>
                  {user.displayName}
                </Typography>
                <IconButton
                  color="inherit"
                  aria-label="Logout"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  sx={{ ...barFocusRing, flexShrink: 0 }}
                >
                  <LogoutIcon />
                </IconButton>
              </Stack>
            </>
          )}
        </Toolbar>
      </AppBar>
      <Container
        id={MAIN_ID}
        component="main"
        maxWidth="lg"
        sx={{ py: 4, flexGrow: 1, scrollMarginTop: (theme) => theme.spacing(10) }}
      >
        {children}
      </Container>
      <Box
        component="footer"
        sx={{ py: 3, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Container maxWidth="lg">
          <Typography variant="body2" color="text.secondary" align="center">
            © Copyright 2024 Expenses Manager V2 I All Rights Reserved
          </Typography>
        </Container>
      </Box>
    </Stack>
  );
}

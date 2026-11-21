import type { ReactNode } from 'react';
import { Box, Breadcrumbs, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
};

const isPresent = (node: ReactNode) =>
  node !== undefined && node !== null && node !== false && node !== '';

export function PageHeader({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) {
  const crumbs = breadcrumbs ?? [];

  return (
    <Stack spacing={2} useFlexGap sx={{ mb: 3 }}>
      {crumbs.length > 0 && (
        <Breadcrumbs aria-label="breadcrumb" separator="›">
          {crumbs.map((item, index) => {
            const key = `${index}-${item.label}`;
            const isLast = index === crumbs.length - 1;
            if (!isLast && item.to !== undefined) {
              return (
                <Link
                  key={key}
                  component={RouterLink}
                  to={item.to}
                  underline="hover"
                  color="primary"
                  variant="body2"
                >
                  {item.label}
                </Link>
              );
            }
            return (
              <Typography
                key={key}
                variant="body2"
                color="text.primary"
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </Typography>
            );
          })}
        </Breadcrumbs>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" tabIndex={-1} sx={{ overflowWrap: 'break-word' }}>
            {title}
          </Typography>
          {isPresent(subtitle) && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {isPresent(actions) && (
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {actions}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

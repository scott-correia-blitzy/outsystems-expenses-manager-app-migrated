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
        // Padded crumbs keep wrapped lines clear of the 44px targets; the negative margin keeps the row at text height.
        <Box sx={{ marginBlock: -1.25 }}>
          <Breadcrumbs
            aria-label="breadcrumb"
            separator={
              <Box component="span" sx={{ py: 1.25 }}>
                ›
              </Box>
            }
          >
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
                    // As an inline box around the flex target, the link would paint its focus ring on empty fragments.
                    sx={{ display: 'block' }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: (theme) => theme.spacing(5.5),
                        minWidth: (theme) => theme.spacing(5.5),
                        marginInline: -0.5,
                        paddingInline: 0.5,
                      }}
                    >
                      {item.label}
                    </Box>
                  </Link>
                );
              }
              return (
                <Box key={key} sx={{ py: 1.25 }}>
                  <Typography
                    variant="body2"
                    color="text.primary"
                    aria-current={isLast ? 'page' : undefined}
                  >
                    {item.label}
                  </Typography>
                </Box>
              );
            })}
          </Breadcrumbs>
        </Box>
      )}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        flexWrap={{ sm: 'wrap' }}
      >
        <Box
          sx={{
            minWidth: 0,
            maxWidth: '100%',
            // The actions move to their own row rather than squeeze the title below this width.
            flex: (theme) => ({ sm: `1 1 ${theme.spacing(40)}` }),
          }}
        >
          <Typography
            variant="h4"
            component="h1"
            tabIndex={-1}
            // Shrinks to the title so the focus ring wraps the text rather than the whole row.
            sx={{ width: 'fit-content', maxWidth: '100%', overflowWrap: 'break-word' }}
          >
            {title}
          </Typography>
          {isPresent(subtitle) && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {isPresent(actions) && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}
            flexWrap="wrap"
            useFlexGap
            sx={{
              flexShrink: 0,
              maxWidth: '100%',
              marginLeft: { sm: 'auto' },
              '& > *': {
                minHeight: (theme) => theme.spacing(5.5),
                minWidth: (theme) => theme.spacing(5.5),
              },
            }}
          >
            {actions}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

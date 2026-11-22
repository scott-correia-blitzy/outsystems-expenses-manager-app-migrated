import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  CardActions,
  CardContent,
  CircularProgress,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { listBlogPosts } from '../api/api';
import type { BlogPostView } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { LiveStatus, useFeedback } from '../components/Feedback';
import { ViewIcon } from '../components/LineTable';
import { formatBlogDate } from '../format/format';
import { PageHeader } from '../layout/PageHeader';
import { blogPostPath } from '../routes';

const BREADCRUMBS = [{ label: 'Home', to: '/' }, { label: 'Blog' }];
const SEARCH_DEBOUNCE_MS = 300;
// Keeps the encoded query well under the server's 8 KB request-header limit.
const SEARCH_MAX_LENGTH = 500;
const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function utcDay(iso: string): number | null {
  const match = ISO_DATE.exec(iso);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

// Calendar dates, as legacy DiffDays compares them, so the browser time zone cannot shift the count.
function daysBetween(from: string, to: string): number | null {
  const start = utcDay(from);
  const end = utcDay(to);
  return start === null || end === null ? null : (end - start) / MS_PER_DAY;
}

function wasEdited(post: BlogPostView): boolean {
  if (!post.updatedOn) {
    return false;
  }
  const days = daysBetween(post.createdOn, post.updatedOn);
  return days !== null && days > 1;
}

function byline(iso: string | null, name: string | null): string {
  const date = formatBlogDate(iso);
  return name ? `${date} by ${name}` : date;
}

function resultCount(count: number): string {
  return `${count} blog ${count === 1 ? 'post' : 'posts'}`;
}

function BlogPostCard({ post, canEdit }: { post: BlogPostView; canEdit: boolean }) {
  const titleId = `blog-post-${post.id}-title`;

  return (
    <Card component="article" aria-labelledby={titleId}>
      <CardContent>
        <Stack spacing={1}>
          <Typography id={titleId} variant="h6" component="h2" sx={{ overflowWrap: 'break-word' }}>
            {post.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {byline(post.createdOn, post.createdByName)}
          </Typography>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-line', overflowWrap: 'break-word' }}>
            {post.description}
          </Typography>
          {wasEdited(post) && (
            <Typography variant="caption" color="text.secondary">
              {`Post edited on ${byline(post.updatedOn, post.updatedByName)}`}
            </Typography>
          )}
        </Stack>
      </CardContent>
      {canEdit && (
        <CardActions>
          <Button size="small" component={RouterLink} to={blogPostPath(post.id)} aria-describedby={titleId}>
            Edit post
          </Button>
        </CardActions>
      )}
    </Card>
  );
}

export function BlogPage() {
  const { hasRole } = useAuth();
  const feedback = useFeedback();
  const isAdmin = hasRole('Administrator');
  const [search, setSearch] = useState('');
  const [posts, setPosts] = useState<BlogPostView[] | null>(null);
  const [postsQuery, setPostsQuery] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const query = search.trim();

  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        listBlogPosts(query || undefined)
          .then(
            (result) => {
              if (active) {
                setPosts(result);
                setPostsQuery(query);
              }
            },
            (err: unknown) => {
              if (active) {
                feedback.error(err);
              }
            },
          )
          .finally(() => {
            if (active) {
              setSettled(true);
            }
          });
      },
      query === '' ? 0 : SEARCH_DEBOUNCE_MS,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, feedback]);

  let content: ReactNode = null;
  if (!settled) {
    content = (
      <Stack alignItems="center" sx={{ py: 4 }}>
        <CircularProgress aria-label="Loading blog posts" />
      </Stack>
    );
  } else if (posts !== null && posts.length === 0) {
    content = (
      <Typography color="text.secondary">
        No blog posts yet
      </Typography>
    );
  } else if (posts !== null) {
    content = (
      <Stack spacing={2}>
        {posts.map((post) => (
          <BlogPostCard key={post.id} post={post} canEdit={isAdmin} />
        ))}
      </Stack>
    );
  }

  // Empty while a search is pending, so an unchanged count is announced again when it completes.
  const announcement = posts !== null && postsQuery === query ? resultCount(posts.length) : '';

  return (
    <>
      <PageHeader
        title="Blog"
        subtitle="Latest news & updates"
        breadcrumbs={BREADCRUMBS}
        actions={
          isAdmin ? (
            <Button variant="contained" component={RouterLink} to={blogPostPath('new')}>
              New Post
            </Button>
          ) : undefined
        }
      />
      <Stack spacing={3}>
        <TextField
          type="search"
          size="small"
          placeholder="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value.slice(0, SEARCH_MAX_LENGTH))}
          fullWidth
          sx={{ maxWidth: 'sm', '& input::-webkit-search-cancel-button': { display: 'none' } }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search', maxLength: SEARCH_MAX_LENGTH },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <ViewIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
        {content}
      </Stack>
      <LiveStatus message={announcement} />
    </>
  );
}

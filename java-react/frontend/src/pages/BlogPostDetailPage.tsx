import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Box, Button, Card, CardContent, CircularProgress, Stack, TextField } from '@mui/material';
import { Link as RouterLink, Navigate, useNavigate, useParams } from 'react-router';
import { createBlogPost, getBlogPost, updateBlogPost } from '../api/api';
import { ApiError, MESSAGES, type BlogPostBody } from '../api/types';
import { useFeedback } from '../components/Feedback';
import { PageHeader } from '../layout/PageHeader';
import { PATHS } from '../routes';

const TITLE_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 10000;

type PostField = 'title' | 'description';
type FieldErrors = Record<PostField, string>;

const NO_ERRORS: FieldErrors = { title: '', description: '' };

function parsePostId(id: string | undefined): number | null {
  if (id === undefined || !/^\d+$/.test(id)) {
    return null;
  }
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function validate(title: string, description: string): FieldErrors {
  let titleError = '';
  if (title.trim() === '') {
    titleError = MESSAGES.FIELD_REQUIRED;
  } else if (title.length > TITLE_MAX_LENGTH) {
    titleError = MESSAGES.MAX_LENGTH_50;
  }
  return {
    title: titleError,
    description: description.length > DESCRIPTION_MAX_LENGTH ? MESSAGES.MAX_LENGTH_10000 : '',
  };
}

function hasErrors(errors: FieldErrors): boolean {
  return errors.title !== '' || errors.description !== '';
}

function isPostField(field: string): field is PostField {
  return field === 'title' || field === 'description';
}

function serverFieldErrors(err: unknown): FieldErrors | null {
  if (!(err instanceof ApiError)) {
    return null;
  }
  const errors: FieldErrors = { ...NO_ERRORS };
  for (const fieldError of err.fieldErrors ?? []) {
    if (isPostField(fieldError.field) && errors[fieldError.field] === '') {
      errors[fieldError.field] = fieldError.message;
    }
  }
  return hasErrors(errors) ? errors : null;
}

export function BlogPostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const feedback = useFeedback();
  const isNew = id === 'new';
  const postId = isNew ? null : parsePostId(id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [loading, setLoading] = useState(postId !== null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setErrors(NO_ERRORS);
    if (postId === null) {
      setTitle('');
      setDescription('');
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getBlogPost(postId)
      .then((post) => {
        if (active) {
          setTitle(post.title);
          setDescription(post.description ?? '');
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          feedback.error(err);
          navigate(PATHS.blog, { replace: true });
        }
      });
    return () => {
      active = false;
    };
  }, [postId, feedback, navigate]);

  if (!isNew && postId === null) {
    return <Navigate to={PATHS.blog} replace />;
  }

  const heading = isNew ? 'New Blog Post' : 'Edit Blog Post';

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTitle(event.target.value);
    setErrors((prev) => ({ ...prev, title: '' }));
  };

  const handleDescriptionChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDescription(event.target.value);
    setErrors((prev) => ({ ...prev, description: '' }));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) {
      return;
    }
    const nextErrors = validate(title, description);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      return;
    }
    const body: BlogPostBody = { title, description };
    setSaving(true);
    try {
      await (postId === null ? createBlogPost(body) : updateBlogPost(postId, body));
      feedback.success(MESSAGES.BLOG_POST_PUBLISHED);
      navigate(PATHS.blog);
    } catch (err) {
      const fieldErrors = serverFieldErrors(err);
      if (fieldErrors === null) {
        feedback.error(err);
      } else {
        setErrors(fieldErrors);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title={heading}
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Blog', to: PATHS.blog }, { label: heading }]}
      />
      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress aria-label="Loading" />
        </Stack>
      ) : (
        <Card sx={{ maxWidth: 'md' }}>
          <CardContent>
            <Box component="form" noValidate onSubmit={handleSave}>
              <Stack spacing={2}>
                <TextField
                  label="Title"
                  required
                  fullWidth
                  value={title}
                  onChange={handleTitleChange}
                  error={errors.title !== ''}
                  helperText={errors.title || undefined}
                  slotProps={{ htmlInput: { maxLength: TITLE_MAX_LENGTH } }}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={6}
                  fullWidth
                  value={description}
                  onChange={handleDescriptionChange}
                  error={errors.description !== ''}
                  helperText={errors.description || undefined}
                  slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX_LENGTH } }}
                />
                <Stack direction="row" spacing={2}>
                  <Button component={RouterLink} to={PATHS.blog} variant="outlined">
                    Back
                  </Button>
                  <Button type="submit" variant="contained" loading={saving}>
                    Save
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </CardContent>
        </Card>
      )}
    </>
  );
}

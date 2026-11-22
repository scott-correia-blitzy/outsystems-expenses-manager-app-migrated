import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Box, Button, Card, CardContent, CircularProgress, Stack, TextField } from '@mui/material';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import { createBlogPost, getBlogPost, updateBlogPost } from '../api/api';
import { ApiError, MESSAGES, type BlogPostBody, type FieldError } from '../api/types';
import { unplacedError, useFeedback } from '../components/Feedback';
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

type ServerFieldErrors = { fields: FieldErrors; unplaced: ApiError | null };

function serverFieldErrors(err: unknown): ServerFieldErrors | null {
  if (!(err instanceof ApiError)) {
    return null;
  }
  const fields: FieldErrors = { ...NO_ERRORS };
  const unplaced: FieldError[] = [];
  for (const fieldError of err.fieldErrors ?? []) {
    if (isPostField(fieldError.field)) {
      const current = fields[fieldError.field];
      fields[fieldError.field] = current === '' ? fieldError.message : `${current}\n${fieldError.message}`;
    } else {
      unplaced.push(fieldError);
    }
  }
  if (!hasErrors(fields)) {
    return null;
  }
  return {
    fields,
    unplaced: unplaced.length > 0 ? unplacedError(err, unplaced) : null,
  };
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
  // Unlike saving, the ref updates at once, so a second submit before the next render is ignored.
  const saveInFlight = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (saving || !restoreFocus.current) {
      return;
    }
    restoreFocus.current = false;
    // A loading button is disabled and loses focus to body; restore it unless the user has moved on.
    if (document.activeElement === null || document.activeElement === document.body) {
      saveButton.current?.focus();
    }
  }, [saving]);

  useEffect(() => {
    setErrors(NO_ERRORS);
    if (postId === null) {
      if (!isNew) {
        feedback.warning(MESSAGES.NOT_FOUND);
        navigate(PATHS.blog, { replace: true });
        return;
      }
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
  }, [postId, isNew, feedback, navigate]);

  if (!isNew && postId === null) {
    return null;
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

  const focusFirstInvalid = (fieldErrors: FieldErrors): boolean => {
    if (fieldErrors.title !== '') {
      titleInput.current?.focus();
    } else if (fieldErrors.description !== '') {
      descriptionInput.current?.focus();
    } else {
      return false;
    }
    return true;
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveInFlight.current) {
      return;
    }
    const nextErrors = validate(title, description);
    setErrors(nextErrors);
    if (focusFirstInvalid(nextErrors)) {
      return;
    }
    const body: BlogPostBody = { title, description };
    saveInFlight.current = true;
    setSaving(true);
    try {
      await (postId === null ? createBlogPost(body) : updateBlogPost(postId, body));
      feedback.success(MESSAGES.BLOG_POST_PUBLISHED);
      navigate(PATHS.blog);
    } catch (err) {
      restoreFocus.current = true;
      const serverErrors = serverFieldErrors(err);
      if (serverErrors === null) {
        feedback.error(err);
      } else {
        setErrors(serverErrors.fields);
        focusFirstInvalid(serverErrors.fields);
        if (serverErrors.unplaced) {
          feedback.error(serverErrors.unplaced);
        }
      }
    } finally {
      saveInFlight.current = false;
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
                  inputRef={titleInput}
                  error={errors.title !== ''}
                  helperText={errors.title || undefined}
                  slotProps={{
                    htmlInput: { maxLength: TITLE_MAX_LENGTH },
                    formHelperText: { sx: { whiteSpace: 'pre-line' } },
                  }}
                />
                <TextField
                  label="Description"
                  multiline
                  minRows={6}
                  fullWidth
                  value={description}
                  onChange={handleDescriptionChange}
                  inputRef={descriptionInput}
                  error={errors.description !== ''}
                  helperText={errors.description || undefined}
                  slotProps={{
                    htmlInput: { maxLength: DESCRIPTION_MAX_LENGTH },
                    formHelperText: { sx: { whiteSpace: 'pre-line' } },
                  }}
                />
                <Stack direction="row" spacing={2}>
                  <Button component={RouterLink} to={PATHS.blog} variant="outlined">
                    Back
                  </Button>
                  <Button ref={saveButton} type="submit" variant="contained" loading={saving}>
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

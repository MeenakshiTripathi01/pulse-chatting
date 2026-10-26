import { useState } from 'react';
import { Link } from 'react-router';
import { getErrorCode } from '../api/client.js';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/TextField.jsx';
import { useAuth } from '../context/authContext.js';
import { useFormState } from '../hooks/useFormState.js';
import { loginSchema, newAccountLoginSchema } from '../lib/validation.js';

const SUBMIT_LABELS = {
  signIn: ['Continue', 'Signing in…'],
  create: ['Create account', 'Creating account…'],
};

export default function LoginPage() {
  const { login, notice } = useAuth();
  // Becomes true once the server says this email is new; only then is a username asked for.
  const [needsUsername, setNeedsUsername] = useState(false);
  const { values, fieldErrors, formError, submitting, handleChange, handleSubmit } = useFormState({
    initialValues: { email: '', password: '', username: '' },
    schema: needsUsername ? newAccountLoginSchema : loginSchema,
    onSubmit: login,
    onError: (error) => {
      if (getErrorCode(error) !== 'USERNAME_REQUIRED') return false;
      setNeedsUsername(true);
      return true;
    },
    fieldForErrorCode: { USERNAME_TAKEN: 'username' },
  });

  function handleEmailChange(event) {
    setNeedsUsername(false);
    handleChange(event);
  }

  return (
    <AuthLayout
      title="Welcome to Pulse"
      subtitle="Enter your email and password. New email? We'll create your account automatically."
      footer={
        <>
          Want to choose your display name?{' '}
          <Link
            to="/register"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Sign up with a name
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {notice && !formError && !needsUsername && <Alert tone="info">{notice}</Alert>}
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleEmailChange}
          error={fieldErrors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete={needsUsername ? 'new-password' : 'current-password'}
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
          hint="New accounts: at least 8 characters, with a letter and a number."
        />
        {needsUsername && (
          <>
            <Alert tone="info">
              This email is new here. Choose a username to create your account.
            </Alert>
            <TextField
              label="Username"
              name="username"
              autoComplete="nickname"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              value={values.username}
              onChange={handleChange}
              error={fieldErrors.username}
              hint="Letters, numbers, dots and underscores. Others can find you by it."
            />
          </>
        )}
        <Button type="submit" loading={submitting} className="w-full">
          {SUBMIT_LABELS[needsUsername ? 'create' : 'signIn'][submitting ? 1 : 0]}
        </Button>
      </form>
    </AuthLayout>
  );
}

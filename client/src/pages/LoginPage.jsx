import { Link } from 'react-router';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/TextField.jsx';
import { useAuth } from '../context/authContext.js';
import { useFormState } from '../hooks/useFormState.js';
import { loginSchema } from '../lib/validation.js';

export default function LoginPage() {
  const { login, notice } = useAuth();
  const { values, fieldErrors, formError, submitting, handleChange, handleSubmit } = useFormState({
    initialValues: { email: '', password: '' },
    schema: loginSchema,
    onSubmit: login,
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to continue your conversations."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-medium text-brand-700 underline-offset-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {notice && !formError && <Alert tone="info">{notice}</Alert>}
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
}

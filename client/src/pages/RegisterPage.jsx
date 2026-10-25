import { Link } from 'react-router';
import { AuthLayout } from '../components/auth/AuthLayout.jsx';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/TextField.jsx';
import { useAuth } from '../context/authContext.js';
import { useFormState } from '../hooks/useFormState.js';
import { registerSchema } from '../lib/validation.js';

export default function RegisterPage() {
  const { register } = useAuth();
  const { values, fieldErrors, formError, submitting, handleChange, handleSubmit } = useFormState({
    initialValues: { name: '', email: '', password: '', confirmPassword: '' },
    schema: registerSchema,
    onSubmit: ({ name, email, password }) => register({ name, email, password }),
    fieldForErrorCode: { EMAIL_TAKEN: 'email' },
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start chatting with people in real time."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={handleChange}
          error={fieldErrors.name}
        />
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
          autoComplete="new-password"
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
          hint="At least 8 characters, with a letter and a number."
        />
        <TextField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={fieldErrors.confirmPassword}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}

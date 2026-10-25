import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../App.jsx';
import { AuthProvider } from '../context/AuthProvider.jsx';

export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Builds an error shaped like the ones axios throws for HTTP error responses. */
export function apiError(status, error = {}) {
  const err = new Error(`Request failed with status code ${status}`);
  err.response = { status, data: { error: { message: 'Error', code: 'ERROR', ...error } } };
  return err;
}

export function networkError() {
  const err = new Error('Network Error');
  err.request = {};
  return err;
}

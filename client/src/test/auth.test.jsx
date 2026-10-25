import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../api/auth.js';
import { apiError, networkError, renderApp } from './utils.jsx';

vi.mock('../api/auth.js', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}));
// The chat screen behind the login needs these; these tests only care about auth.
vi.mock('../api/conversations.js', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
}));
vi.mock('../lib/socket.js', async () => {
  const { FakeSocket } = await import('./fakeSocket.js');
  return { createSocket: () => new FakeSocket() };
});

const ada = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };

beforeEach(() => {
  vi.clearAllMocks();
  authApi.getCurrentUser.mockRejectedValue(apiError(401, { code: 'UNAUTHENTICATED' }));
});

describe('route protection and session restore', () => {
  it('redirects visitors without a session to the login page', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('keeps the user logged in after a refresh when the session cookie is valid', async () => {
    authApi.getCurrentUser.mockResolvedValue(ada);
    renderApp('/');

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument();
  });

  it('sends logged-in users away from the login page', async () => {
    authApi.getCurrentUser.mockResolvedValue(ada);
    renderApp('/login');

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it('shows a retry screen when the server cannot be reached', async () => {
    authApi.getCurrentUser.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(ada);
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });
});

describe('login', () => {
  it('validates fields before calling the API', async () => {
    renderApp('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(authApi.login).not.toHaveBeenCalled();
  });

  it('logs in and opens the chat', async () => {
    authApi.login.mockResolvedValue(ada);
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), '  ADA@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Password123',
    });
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it('shows the server message for invalid credentials', async () => {
    authApi.login.mockRejectedValue(
      apiError(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }),
    );
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
});

describe('registration', () => {
  async function fillRegisterForm({ name, email, password, confirmPassword }) {
    await userEvent.type(await screen.findByLabelText('Name'), name);
    await userEvent.type(screen.getByLabelText('Email'), email);
    await userEvent.type(screen.getByLabelText('Password'), password);
    await userEvent.type(screen.getByLabelText('Confirm password'), confirmPassword);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('enforces password rules and matching confirmation', async () => {
    renderApp('/register');
    await fillRegisterForm({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'onlyletters',
      confirmPassword: 'different',
    });

    expect(
      screen.getByText('Password must contain at least one letter and one number'),
    ).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(authApi.register).not.toHaveBeenCalled();
  });

  it('shows a duplicate email error next to the email field', async () => {
    authApi.register.mockRejectedValue(
      apiError(409, { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' }),
    );
    renderApp('/register');
    await fillRegisterForm({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    });

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('registers without sending the confirmation field and signs the user in', async () => {
    authApi.register.mockResolvedValue(ada);
    renderApp('/register');
    await fillRegisterForm({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    });

    expect(authApi.register).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'Password123',
    });
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });
});

describe('logout', () => {
  it('returns to the login page', async () => {
    authApi.getCurrentUser.mockResolvedValue(ada);
    authApi.logout.mockResolvedValue();
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalled();
  });
});

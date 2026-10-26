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
    expect(await screen.findByRole('heading', { name: 'Welcome to Pulse' })).toBeInTheDocument();
  });

  it('keeps the user logged in after a refresh when the session cookie is valid', async () => {
    authApi.getCurrentUser.mockResolvedValue(ada);
    renderApp('/');

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome to Pulse' })).not.toBeInTheDocument();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }));

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
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(authApi.login).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Password123',
    });
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it('shows the server message for a wrong password', async () => {
    authApi.login.mockRejectedValue(
      apiError(401, { code: 'WRONG_PASSWORD', message: 'Incorrect password for this email.' }),
    );
    renderApp('/login');

    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect password for this email.',
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  async function submitNewEmail() {
    await userEvent.type(await screen.findByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  }

  const usernameRequired = () =>
    apiError(400, { code: 'USERNAME_REQUIRED', message: 'Choose a username' });

  it('does not ask existing users for a username', async () => {
    authApi.login.mockResolvedValue(ada);
    renderApp('/login');

    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('asks for a username only when the email is new, then creates the account', async () => {
    authApi.login.mockRejectedValueOnce(usernameRequired()).mockResolvedValueOnce(ada);
    renderApp('/login');

    await submitNewEmail();

    const usernameField = await screen.findByLabelText('Username');
    expect(usernameField).toHaveFocus();
    expect(screen.getByText(/This email is new here/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Username is required')).toBeInTheDocument();
    expect(authApi.login).toHaveBeenCalledTimes(1);

    await userEvent.type(usernameField, ' Ada_L ');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(authApi.login).toHaveBeenLastCalledWith({
      email: 'new@example.com',
      password: 'Password123',
      username: 'ada_l',
    });
    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it('hides the username field again if the email is changed', async () => {
    authApi.login.mockRejectedValueOnce(usernameRequired());
    renderApp('/login');

    await submitNewEmail();
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Email'), 'x');
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('shows a taken username next to its field', async () => {
    authApi.login
      .mockRejectedValueOnce(usernameRequired())
      .mockRejectedValueOnce(
        apiError(409, { code: 'USERNAME_TAKEN', message: 'This username is already taken.' }),
      );
    renderApp('/login');

    await submitNewEmail();
    await userEvent.type(await screen.findByLabelText('Username'), 'alice');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('This username is already taken.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('registration', () => {
  async function fillRegisterForm({ name, username = 'ada', email, password, confirmPassword }) {
    await userEvent.type(await screen.findByLabelText('Name'), name);
    await userEvent.type(screen.getByLabelText('Username'), username);
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
      username: 'ada',
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

    expect(await screen.findByRole('heading', { name: 'Welcome to Pulse' })).toBeInTheDocument();
    expect(authApi.logout).toHaveBeenCalled();
  });
});

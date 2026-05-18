import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '../../pages/LoginPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const mockLogin = vi.fn();
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({ login: mockLogin, isLoading: false }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderLogin = (url = '/login') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <LoginPage />
    </MemoryRouter>,
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an email field and a password field', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('votre@email.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Votre mot de passe')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('shows a "Mot de passe oublié ?" link pointing to /forgot-password', () => {
    renderLogin();
    const link = screen.getByRole('link', { name: /mot de passe oublié/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });

  it('shows a link to /register', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /s'inscrire/i })).toBeInTheDocument();
  });

  it('prefills the email field from the ?email= query param', () => {
    renderLogin('/login?email=bob%40example.com');
    expect(screen.getByPlaceholderText('votre@email.com')).toHaveValue('bob@example.com');
  });

  it('calls login() with the typed credentials on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    expect(mockLogin).toHaveBeenCalledWith('alice@example.com', 'password123');
  });

  it('navigates to /dashboard on successful login', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });

  it('navigates to the ?next= path on success (open-redirect guard)', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin('/login?next=/calendar');

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/calendar'));
  });

  it('falls back to /dashboard for an unsafe ?next= value', async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLogin('/login?next=https://evil.com');

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.type(screen.getByPlaceholderText('Votre mot de passe'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows a toast error when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    renderLogin();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.type(screen.getByPlaceholderText('Votre mot de passe'), 'wrongpassword');
    await userEvent.click(screen.getByRole('button', { name: /se connecter/i }));

    const toast = (await import('react-hot-toast')).default;
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Email ou mot de passe incorrect'),
    );
  });
});

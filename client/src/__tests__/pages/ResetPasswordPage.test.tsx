import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from '../../pages/ResetPasswordPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../config/api', () => ({
  default: { post: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPage = (url = '/reset-password?token=validtoken123') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ResetPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders password fields when a token is present in the URL', () => {
    renderPage();
    expect(screen.getByPlaceholderText('8 caractères minimum')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Répétez le mot de passe')).toBeInTheDocument();
  });

  it('shows an "invalid link" error when no token is in the URL', () => {
    renderPage('/reset-password');
    expect(screen.getByText(/lien invalide/i)).toBeInTheDocument();
  });

  it('disables the submit button when there is no token', () => {
    renderPage('/reset-password');
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('shows an error when the two passwords do not match', async () => {
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('8 caractères minimum'), 'password123');
    await userEvent.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'different123');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(screen.getByText(/ne correspondent pas/i)).toBeInTheDocument();
  });

  it('does not call the API when passwords do not match', async () => {
    const api = (await import('../../config/api')).default;
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('8 caractères minimum'), 'password123');
    await userEvent.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'different123');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(api.post).not.toHaveBeenCalled();
  });

  it('calls the API with the token and new password on valid submit', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('8 caractères minimum'), 'newpassword123');
    await userEvent.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
        token:    'validtoken123',
        password: 'newpassword123',
      }),
    );
  });

  it('shows a success state after a successful reset', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('8 caractères minimum'), 'newpassword123');
    await userEvent.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() =>
      expect(screen.getByText(/mot de passe mis à jour/i)).toBeInTheDocument(),
    );
  });

  it('shows the server error message when the token is expired', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { message: 'Ce lien est invalide ou a expiré.' } },
    });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('8 caractères minimum'), 'newpassword123');
    await userEvent.type(screen.getByPlaceholderText('Répétez le mot de passe'), 'newpassword123');
    await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalide ou a expiré/i)).toBeInTheDocument(),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../../pages/ForgotPasswordPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../config/api', () => ({
  default: { post: vi.fn() },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const renderPage = () =>
  render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the email input and the submit button', () => {
    renderPage();
    expect(screen.getByPlaceholderText('votre@email.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /envoyer le lien/i })).toBeInTheDocument();
  });

  it('has a "Retour à la connexion" link', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /retour à la connexion/i })).toBeInTheDocument();
  });

  it('shows the success state after a successful API call', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => expect(screen.getByText(/email envoyé/i)).toBeInTheDocument());
  });

  it('displays the submitted email address in the success message', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument());
  });

  it('posts to /auth/forgot-password with the entered email', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'alice@example.com' }),
    );
  });

  it('shows an error message when the API call fails', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockRejectedValue(new Error('Network error'));
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() =>
      expect(screen.getByText(/une erreur est survenue/i)).toBeInTheDocument(),
    );
  });

  it('does not show the form after a successful submission', async () => {
    const api = (await import('../../config/api')).default;
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    renderPage();

    await userEvent.type(screen.getByPlaceholderText('votre@email.com'), 'alice@example.com');
    await userEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /envoyer le lien/i })).not.toBeInTheDocument(),
    );
  });
});

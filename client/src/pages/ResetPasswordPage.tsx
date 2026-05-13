import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Users, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import api from '../config/api';
import toast from 'react-hot-toast';

export function ResetPasswordPage() {
  const [searchParams]          = useSearchParams();
  const navigate                = useNavigate();
  const token                   = searchParams.get('token') ?? '';

  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!token) {
      setError('Lien invalide. Veuillez refaire la demande de réinitialisation.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      toast.success('Mot de passe mis à jour !');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message?: string } } }).response?.data?.message
          : undefined;
      setError(msg ?? 'Lien invalide ou expiré. Veuillez refaire la demande.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">FamilyApp</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Nouveau mot de passe</p>
        </div>

        <div className="card p-6">
          {done ? (
            /* ── Success state ── */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Mot de passe mis à jour
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Vous allez être redirigé vers la page de connexion…
              </p>
            </div>
          ) : (
            /* ── Form ── */
            <>
              {!token && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  Lien invalide. Veuillez{' '}
                  <Link to="/forgot-password" className="underline font-medium">
                    refaire la demande
                  </Link>
                  .
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="password"
                  label="Nouveau mot de passe"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  required
                  minLength={8}
                />
                <Input
                  id="confirm"
                  label="Confirmer le mot de passe"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  required
                />
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  isLoading={loading}
                  disabled={!token}
                >
                  Enregistrer le mot de passe
                </Button>
              </form>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                <Link to="/login" className="text-primary-600 hover:underline font-medium">
                  Retour à la connexion
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

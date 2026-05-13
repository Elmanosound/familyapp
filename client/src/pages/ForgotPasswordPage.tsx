import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Users, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import api from '../config/api';

export function ForgotPasswordPage() {
  const [email,     setEmail]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
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
          <p className="text-gray-600 dark:text-gray-400 mt-2">Réinitialisation du mot de passe</p>
        </div>

        <div className="card p-6">
          {submitted ? (
            /* ── Success state ── */
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full mb-4">
                <Mail className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Email envoyé !
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Si un compte existe pour <strong>{email}</strong>, vous recevrez un lien valable
                1 heure pour choisir un nouveau mot de passe.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-primary-600 hover:underline font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour à la connexion
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
                Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser
                votre mot de passe.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  id="email"
                  label="Adresse email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                />
                <Button type="submit" className="w-full" size="lg" isLoading={loading}>
                  Envoyer le lien
                </Button>
              </form>

              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 text-primary-600 hover:underline font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
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

import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

export function RegisterPage() {
  // `next` and `email` may be set when this page is opened from the
  // invitation flow (/invite/:token). We prefill the email and, on
  // successful register, redirect to the `next` path so the invitation is
  // auto-accepted without requiring the user to re-navigate.
  const [searchParams] = useSearchParams();
  const nextPath = searchParams.get('next');
  const prefillEmail = searchParams.get('email') ?? '';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: prefillEmail,
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    try {
      await register({ firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password, ...(form.phone && { phone: form.phone }) });
      toast.success('Compte cree avec succes !');
      // Same safe-redirect rule as LoginPage: only allow internal paths.
      const safeNext = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';
      navigate(safeNext);
    } catch {
      toast.error("Erreur lors de l'inscription");
    }
  };

  // Preserve query params when linking back to login so the invitation
  // token isn't dropped if the user clicks "Se connecter".
  const loginHref = nextPath || prefillEmail
    ? `/login?${searchParams.toString()}`
    : '/login';

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Rejoindre FamilyApp</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Creez votre compte en quelques secondes</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input id="firstName" label="Prenom" value={form.firstName} onChange={update('firstName')} required />
              <Input id="lastName" label="Nom" value={form.lastName} onChange={update('lastName')} required />
            </div>
            <Input id="email" label="Email" type="email" value={form.email} onChange={update('email')} required />
            <Input id="phone" label="Telephone" type="tel" value={form.phone} onChange={update('phone')} placeholder="+33 6 12 34 56 78" />
            <Input id="password" label="Mot de passe" type="password" value={form.password} onChange={update('password')} required minLength={6} />
            <Input id="confirmPassword" label="Confirmer le mot de passe" type="password" value={form.confirmPassword} onChange={update('confirmPassword')} required minLength={6} />
            <Button type="submit" className="w-full" size="lg" isLoading={isLoading}>
              Creer mon compte
            </Button>
          </form>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
            Deja un compte ?{' '}
            <Link to={loginHref} className="text-primary-600 hover:underline font-medium">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

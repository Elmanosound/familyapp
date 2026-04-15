import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useAuthStore } from '../stores/authStore';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import toast from 'react-hot-toast';

interface InvitationPreview {
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  family: { id: string; name: string; type: string };
}

/**
 * Public page rendered at /invite/:token.
 *
 * Flow:
 *   1. GET /families/invitations/:token (public) → show a preview card
 *      with the target group's name so the recipient knows what they're
 *      joining before doing anything.
 *   2. If they're not signed in, offer Login / Register CTAs that carry
 *      the current URL as `?next=/invite/:token` so they're brought back
 *      here after authenticating, plus the invited email so the register
 *      form is pre-filled.
 *   3. If signed in, a single "Rejoindre" button POSTs the accept
 *      endpoint, refreshes families + activates the new one, and routes
 *      to the dashboard.
 */
export function AcceptInvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { fetchFamilies, switchFamily } = useFamilyStore();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // 1. Load preview on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/families/invitations/${token}`);
        if (!cancelled) setPreview(data.invitation);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Invitation introuvable';
        if (!cancelled) setLoadError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleAccept = async () => {
    if (!preview) return;
    setJoining(true);
    try {
      await api.post(`/families/invitations/${token}/accept`);
      // Pull the updated family list so the new one is in the store, then
      // activate it so the dashboard opens pointing at the group the user
      // just joined.
      await fetchFamilies();
      await switchFamily(preview.family.id);
      toast.success(`Bienvenue dans ${preview.family.name} !`);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Impossible d'accepter l'invitation";
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  };

  // ─── render states ─────────────────────────────────────────────

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-3">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Invitation FamilyApp</h1>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6">
          <Spinner />
          <p className="text-sm text-gray-500">Verification du lien...</p>
        </div>
      </Shell>
    );
  }

  if (loadError || !preview) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertTriangle className="w-10 h-10 text-red-500" />
          <h2 className="font-semibold">Lien invalide</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
          <Button onClick={() => navigate('/login')} variant="secondary" className="mt-2">
            Retour a la connexion
          </Button>
        </div>
      </Shell>
    );
  }

  if (preview.status === 'expired') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500" />
          <h2 className="font-semibold">Invitation expiree</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Ce lien d'invitation n'est plus valide. Demande a l'administrateur de
            t'en envoyer un nouveau.
          </p>
        </div>
      </Shell>
    );
  }

  if (preview.status === 'accepted') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
          <h2 className="font-semibold">Invitation deja utilisee</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cette invitation a deja ete acceptee.
          </p>
          <Button onClick={() => navigate('/login')} className="mt-2">
            Se connecter
          </Button>
        </div>
      </Shell>
    );
  }

  // Pending invitation — either prompt to login/register, or prompt to join.
  const nextParam = encodeURIComponent(`/invite/${token}`);
  const emailParam = encodeURIComponent(preview.email);

  return (
    <Shell>
      <div className="text-center mb-5">
        <p className="text-sm text-gray-500 mb-1">Tu es invite a rejoindre</p>
        <h2 className="text-xl font-bold">{preview.family.name}</h2>
        <p className="text-xs text-gray-500 mt-1">
          Invitation envoyee a <span className="font-medium">{preview.email}</span>
        </p>
      </div>

      {isAuthenticated ? (
        <Button onClick={handleAccept} isLoading={joining} className="w-full" size="lg">
          Rejoindre {preview.family.name}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Pour accepter cette invitation, connecte-toi ou cree un compte.
          </p>
          <Link to={`/register?next=${nextParam}&email=${emailParam}`} className="block">
            <Button className="w-full" size="lg">Creer un compte</Button>
          </Link>
          <Link to={`/login?next=${nextParam}&email=${emailParam}`} className="block">
            <Button variant="secondary" className="w-full" size="lg">
              J'ai deja un compte
            </Button>
          </Link>
        </div>
      )}
    </Shell>
  );
}

import { useState, useEffect } from 'react';
import {
  Settings, UserPlus, Crown, User as UserIcon, Trash2,
  Save, Copy, Check, Link, AlertTriangle, LogOut, Mail,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import type { FamilyType } from '@familyapp/shared';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const FAMILY_TYPES: { value: FamilyType; label: string }[] = [
  { value: 'family', label: 'Famille' },
  { value: 'friends', label: 'Amis' },
  { value: 'neighbors', label: 'Voisins' },
  { value: 'custom', label: 'Personnalise' },
];

export function FamilySettingsPage() {
  const {
    activeFamily, inviteMember, createFamily, fetchFamilies,
    removeMember, updateFamily, deleteFamily, leaveFamily,
  } = useFamilyStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // --- state ---
  const [showCreate, setShowCreate] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');

  // Edit family info
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<FamilyType>('family');
  const [savingInfo, setSavingInfo] = useState(false);

  // Invite
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [invitationExpiry, setInvitationExpiry] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Remove member
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  // Danger zone
  const [showDangerModal, setShowDangerModal] = useState(false);
  const [dangerAction, setDangerAction] = useState<'leave' | 'delete'>('leave');
  const [dangerLoading, setDangerLoading] = useState(false);

  // Sync form with active family
  useEffect(() => {
    if (activeFamily) {
      setEditName(activeFamily.name);
      setEditType(activeFamily.type);
    }
  }, [activeFamily]);

  // Determine if current user is admin
  const currentMember = activeFamily?.members.find((m) => {
    const u = m.user as unknown as { _id: string };
    return u._id === user?._id || (m.user as unknown as string) === user?._id;
  });
  const isAdmin = currentMember?.role === 'admin';

  // --- handlers ---

  const handleSaveInfo = async () => {
    if (!activeFamily || !editName.trim()) return;
    setSavingInfo(true);
    try {
      await updateFamily(activeFamily._id, { name: editName.trim(), type: editType });
      toast.success('Informations mises a jour');
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleInvite = async () => {
    if (!activeFamily || !email.trim()) return;
    setInviting(true);
    try {
      const invitation = await inviteMember(activeFamily._id, email.trim(), 'member');
      const link = `${window.location.origin}/invite/${invitation.token}`;
      setInvitationLink(link);
      setInvitationExpiry(invitation.expiresAt);
      setLinkCopied(false);
      toast.success('Invitation envoyee');
      setEmail('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || "Erreur lors de l'invitation");
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!invitationLink) return;
    try {
      await navigator.clipboard.writeText(invitationLink);
      setLinkCopied(true);
      toast.success('Lien copie dans le presse-papiers');
      setTimeout(() => setLinkCopied(false), 3000);
    } catch {
      toast.error('Impossible de copier le lien');
    }
  };

  const confirmRemoveMember = (memberId: string, memberName: string) => {
    setMemberToRemove({ id: memberId, name: memberName });
    setShowRemoveModal(true);
  };

  const handleRemoveMember = async () => {
    if (!activeFamily || !memberToRemove) return;
    setRemoving(true);
    try {
      await removeMember(activeFamily._id, memberToRemove.id);
      toast.success('Membre retire');
      setShowRemoveModal(false);
      setMemberToRemove(null);
    } catch {
      toast.error('Erreur lors du retrait du membre');
    } finally {
      setRemoving(false);
    }
  };

  const openDangerModal = (action: 'leave' | 'delete') => {
    setDangerAction(action);
    setShowDangerModal(true);
  };

  const handleDangerAction = async () => {
    if (!activeFamily || !user) return;
    setDangerLoading(true);
    try {
      if (dangerAction === 'delete') {
        await deleteFamily(activeFamily._id);
        toast.success('Groupe supprime');
      } else {
        await leaveFamily(activeFamily._id, user._id);
        toast.success('Vous avez quitte le groupe');
      }
      setShowDangerModal(false);
      await fetchFamilies();
      navigate('/dashboard');
    } catch {
      toast.error('Erreur lors de cette action');
    } finally {
      setDangerLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newFamilyName.trim()) return;
    await createFamily({ name: newFamilyName.trim(), type: 'family' });
    await fetchFamilies();
    setShowCreate(false);
    setNewFamilyName('');
    toast.success('Groupe cree');
  };

  // --- no active family ---

  if (!activeFamily) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Aucun groupe selectionne</p>
        <Button onClick={() => setShowCreate(true)}>Creer un groupe</Button>
        <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau groupe">
          <div className="space-y-4">
            <Input label="Nom" value={newFamilyName} onChange={(e) => setNewFamilyName(e.target.value)} required />
            <Button onClick={handleCreate} className="w-full">Creer</Button>
          </div>
        </Modal>
      </div>
    );
  }

  // --- render ---

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Parametres du groupe</h2>
        <Button size="sm" onClick={() => setShowCreate(true)} variant="secondary">
          Nouveau groupe
        </Button>
      </div>

      {/* ===== FAMILY INFO ===== */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center">
            <Settings className="w-7 h-7 text-primary-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Informations du groupe</h3>
            <p className="text-sm text-gray-500">{activeFamily.members.length} membre(s)</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Nom du groupe"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={!isAdmin}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type de groupe
            </label>
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as FamilyType)}
              disabled={!isAdmin}
              className="input-field"
            >
              {FAMILY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <Button onClick={handleSaveInfo} isLoading={savingInfo} size="sm">
              <Save className="w-4 h-4 mr-1" /> Enregistrer
            </Button>
          )}
        </div>
      </div>

      {/* ===== MEMBERS ===== */}
      <div className="card mb-6">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold">Membres</h3>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {activeFamily.members.map((member) => {
            const u = member.user as unknown as { _id: string; firstName: string; lastName: string; email: string; avatarUrl?: string };
            const memberId = u._id || String(member.user);
            const memberName = `${u.firstName || 'Membre'} ${u.lastName || ''}`.trim();
            const initials = `${(u.firstName?.[0] || '?')}${(u.lastName?.[0] || '')}`;

            return (
              <div key={memberId} className="flex items-center gap-3 p-4">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt={memberName} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: member.color }}
                  >
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{memberName}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email || ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {member.role === 'admin' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                      <Crown className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium capitalize">
                      <UserIcon className="w-3 h-3" /> {member.role}
                    </span>
                  )}
                  {isAdmin && member.role !== 'admin' && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => confirmRemoveMember(memberId, memberName)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Retirer
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== INVITE SECTION ===== */}
      {isAdmin && (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <UserPlus className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold">Inviter un membre</h3>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="adresse@email.com"
              />
            </div>
            <Button onClick={handleInvite} isLoading={inviting} disabled={!email.trim()}>
              <Mail className="w-4 h-4 mr-1" /> Inviter
            </Button>
          </div>

          {invitationLink && (
            <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Link className="w-4 h-4 text-green-600" />
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Lien d'invitation (valable 7 jours) :
                </p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white dark:bg-gray-800 px-3 py-2 rounded border border-green-200 dark:border-green-700 break-all select-all">
                  {invitationLink}
                </code>
                <Button size="sm" variant="secondary" onClick={handleCopyLink}>
                  {linkCopied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  Copier
                </Button>
              </div>
              {invitationExpiry && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                  Expire le {new Date(invitationExpiry).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== DANGER ZONE ===== */}
      <div className="card p-6 border-2 border-red-200 dark:border-red-800">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h3 className="font-semibold text-red-600 dark:text-red-400">Zone de danger</h3>
        </div>

        {isAdmin ? (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Supprimer ce groupe de maniere permanente. Tous les membres seront retires et les donnees associees seront perdues.
            </p>
            <Button variant="danger" onClick={() => openDangerModal('delete')}>
              <Trash2 className="w-4 h-4 mr-1" /> Supprimer le groupe
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Quitter ce groupe. Vous ne pourrez plus acceder aux donnees partagees.
            </p>
            <Button variant="danger" onClick={() => openDangerModal('leave')}>
              <LogOut className="w-4 h-4 mr-1" /> Quitter le groupe
            </Button>
          </div>
        )}
      </div>

      {/* ===== MODALS ===== */}

      {/* Remove member confirmation */}
      <Modal isOpen={showRemoveModal} onClose={() => setShowRemoveModal(false)} title="Retirer un membre" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Voulez-vous vraiment retirer <span className="font-semibold">{memberToRemove?.name}</span> du groupe ?
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowRemoveModal(false)} className="flex-1">
              Annuler
            </Button>
            <Button variant="danger" onClick={handleRemoveMember} isLoading={removing} className="flex-1">
              Retirer
            </Button>
          </div>
        </div>
      </Modal>

      {/* Danger zone confirmation */}
      <Modal isOpen={showDangerModal} onClose={() => setShowDangerModal(false)} title={dangerAction === 'delete' ? 'Supprimer le groupe' : 'Quitter le groupe'} size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              {dangerAction === 'delete'
                ? 'Cette action est irreversible. Toutes les donnees du groupe seront supprimees.'
                : 'Vous ne pourrez plus acceder aux donnees de ce groupe. Un administrateur devra vous re-inviter.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowDangerModal(false)} className="flex-1">
              Annuler
            </Button>
            <Button variant="danger" onClick={handleDangerAction} isLoading={dangerLoading} className="flex-1">
              {dangerAction === 'delete' ? 'Supprimer' : 'Quitter'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create new group */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nouveau groupe">
        <div className="space-y-4">
          <Input label="Nom" value={newFamilyName} onChange={(e) => setNewFamilyName(e.target.value)} required />
          <Button onClick={handleCreate} className="w-full">Creer</Button>
        </div>
      </Modal>
    </div>
  );
}

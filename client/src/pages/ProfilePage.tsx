import { useState } from 'react';
import { User, Save } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

export function ProfilePage() {
  const { user, updateProfile } = useAuthStore();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
  });

  const handleSave = async () => {
    try {
      await updateProfile(form);
      toast.success('Profil mis a jour');
    } catch {
      toast.error('Erreur');
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6">Mon Profil</h2>

      <div className="card p-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={`${user?.firstName} ${user?.lastName}`} src={user?.avatarUrl} size="lg" />
          <div>
            <p className="font-semibold">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Prenom" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            <Input label="Nom" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
          <Input label="Telephone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+33 6 12 34 56 78" />
          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" /> Enregistrer
          </Button>
        </div>
      </div>
    </div>
  );
}

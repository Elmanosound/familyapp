import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';
import type { CalendarEvent } from '@familyapp/shared';
import toast from 'react-hot-toast';

// Format a Date as a local "YYYY-MM-DDTHH:mm" string — the native format
// that <input type="datetime-local"> expects. Using toISOString() here would
// silently convert to UTC, which shifts the displayed time by the tz offset
// (e.g. CEST = UTC+2).
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  startDate: '',
  endDate: '',
  allDay: false,
  assignedTo: [] as string[],
};

export function CalendarPage() {
  const { activeFamily } = useFamilyStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  // When non-null, the modal is in "edit" mode and Save → PATCH, Delete visible.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  /**
   * Local shape for a family member as actually returned by the server —
   * the shared `FamilyMember` type still models the pre-Prisma design where
   * `user` was a string id. Casting here keeps the mess in one place instead
   * of sprinkling `@ts-expect-error` across the JSX below.
   */
  type MemberWithUser = {
    id: string;
    role: string;
    color: string;
    user: { id: string; firstName: string; lastName: string; avatarUrl?: string };
  };
  const members = (activeFamily?.members ?? []) as unknown as MemberWithUser[];

  // Lookup map for rendering assignee-color dots on day cells.
  const memberColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.user.id, m.color);
    return map;
  }, [members]);

  const fetchEvents = useCallback(async () => {
    if (!activeFamily) return;
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const { data } = await api.get(`/families/${activeFamily._id}/calendar/events`, {
      params: { startDate: start.toISOString(), endDate: end.toISOString() },
    });
    setEvents(data.events);
  }, [activeFamily, currentDate]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const closeModal = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = (day?: Date) => {
    setEditingId(null);
    if (day) {
      // Pre-fill with the clicked day at 09:00-10:00 local so the form
      // displays a sensible time rather than midnight or UTC-shifted.
      const s = new Date(day); s.setHours(9, 0, 0, 0);
      const e = new Date(day); e.setHours(10, 0, 0, 0);
      setForm({ ...EMPTY_FORM, startDate: toLocalInputValue(s), endDate: toLocalInputValue(e) });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowForm(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingId(event._id);
    setForm({
      title: event.title,
      description: event.description ?? '',
      startDate: toLocalInputValue(new Date(event.startDate)),
      endDate: toLocalInputValue(new Date(event.endDate)),
      allDay: event.allDay,
      assignedTo: (event.assignedTo ?? []).map((u) => u.id),
    });
    setShowForm(true);
  };

  const toggleAssignee = (userId: string) => {
    setForm((f) => ({
      ...f,
      assignedTo: f.assignedTo.includes(userId)
        ? f.assignedTo.filter((id) => id !== userId)
        : [...f.assignedTo, userId],
    }));
  };

  const handleSave = async () => {
    if (!activeFamily || !form.title) return;
    try {
      const payload = {
        title: form.title,
        description: form.description,
        allDay: form.allDay,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
        assignedTo: form.assignedTo,
      };
      if (editingId) {
        await api.patch(`/families/${activeFamily._id}/calendar/events/${editingId}`, payload);
        toast.success('Evenement modifie');
      } else {
        await api.post(`/families/${activeFamily._id}/calendar/events`, payload);
        toast.success('Evenement cree');
      }
      closeModal();
      fetchEvents();
    } catch {
      toast.error('Erreur');
    }
  };

  const handleDelete = async () => {
    if (!activeFamily || !editingId) return;
    if (!window.confirm('Supprimer cet evenement ?')) return;
    try {
      await api.delete(`/families/${activeFamily._id}/calendar/events/${editingId}`);
      toast.success('Evenement supprime');
      closeModal();
      fetchEvents();
    } catch {
      toast.error('Erreur');
    }
  };

  const dayEvents = (day: Date) => events.filter((e) => isSameDay(new Date(e.startDate), day));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Calendrier</h2>
        <Button onClick={() => openCreate()} size="sm">
          <Plus className="w-4 h-4 mr-1" /> Evenement
        </Button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold capitalize">{format(currentDate, 'MMMM yyyy', { locale: fr })}</h3>
        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800">
          {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
            <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());
            const evts = dayEvents(day);
            return (
              <div
                key={day.toISOString()}
                className={`p-2 min-h-[80px] border-t border-r border-gray-100 dark:border-gray-700 ${!isCurrentMonth ? 'opacity-40' : ''}`}
              >
                {/* Day number + "create on this day" hit target */}
                <button
                  type="button"
                  onClick={() => openCreate(day)}
                  className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded -m-1 p-1"
                >
                  <span className={`text-sm ${isToday ? 'bg-primary-600 text-white w-6 h-6 rounded-full inline-flex items-center justify-center' : ''}`}>
                    {format(day, 'd')}
                  </span>
                </button>

                {/* Event chips — each is its own clickable to open the
                    edit modal without triggering the day-click create. */}
                <div className="mt-1 space-y-0.5">
                  {evts.slice(0, 3).map((e) => (
                    <button
                      key={e._id}
                      type="button"
                      onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                      className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-calendar/10 text-calendar hover:bg-calendar/20 flex items-center gap-1"
                      title={e.title}
                    >
                      <span className="truncate flex-1">{e.title}</span>
                      {/* Assignee colour dots (up to 3) */}
                      {e.assignedTo?.slice(0, 3).map((u) => (
                        <span
                          key={u.id}
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: memberColorById.get(u.id) ?? '#9ca3af' }}
                          aria-label={`${u.firstName} ${u.lastName}`}
                        />
                      ))}
                    </button>
                  ))}
                  {evts.length > 3 && <span className="text-[10px] text-gray-500">+{evts.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length === 0 && (
        <EmptyState
          icon={<CalendarIcon className="w-12 h-12" />}
          title="Aucun evenement"
          description="Ajoutez votre premier evenement familial"
          action={<Button onClick={() => openCreate()} size="sm">Ajouter</Button>}
        />
      )}

      <Modal
        isOpen={showForm}
        onClose={closeModal}
        title={editingId ? "Modifier l'evenement" : 'Nouvel evenement'}
      >
        <div className="space-y-4">
          <Input
            label="Titre"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Debut"
              type="datetime-local"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
            <Input
              label="Fin"
              type="datetime-local"
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            />
          </div>

          {/* Assignee multi-select. We render a toggleable row per family
              member with their color dot + full name so it stays readable
              even with many members. */}
          {members.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Attribuer à
              </label>
              <div className="grid grid-cols-2 gap-2">
                {members.map((m) => {
                  const checked = form.assignedTo.includes(m.user.id);
                  return (
                    <label
                      key={m.user.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                        checked
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleAssignee(m.user.id)}
                      />
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: m.color }}
                      />
                      <span className="text-sm truncate">
                        {m.user.firstName} {m.user.lastName}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {editingId ? 'Enregistrer' : "Creer l'evenement"}
            </Button>
            {editingId && (
              <Button
                onClick={handleDelete}
                variant="ghost"
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                aria-label="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

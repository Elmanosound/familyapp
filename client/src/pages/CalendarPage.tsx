import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Trash2, List, Repeat,
} from 'lucide-react';
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
// silently convert to UTC, which shifts the displayed time by the tz offset.
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Recurrence types ──────────────────────────────────────────────────────────

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  endDate?: string;
  daysOfWeek?: number[];   // 0 = Mon … 6 = Sun
}

// Extend the shared CalendarEvent type to include the recurrence field
// returned by the server (not yet in @familyapp/shared).
type CalendarEventEx = CalendarEvent & { recurrence?: RecurrenceRule };

// ── Constants ─────────────────────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  daily:   'Jour',
  weekly:  'Semaine',
  monthly: 'Mois',
  yearly:  'Année',
};

const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const EMPTY_FORM = {
  title:               '',
  description:         '',
  startDate:           '',
  endDate:             '',
  allDay:              false,
  assignedTo:          [] as string[],
  // Recurrence
  recurrenceEnabled:   false,
  recurrenceFrequency: 'weekly' as RecurrenceRule['frequency'],
  recurrenceInterval:  1,
  recurrenceDays:      [] as number[],
  recurrenceEndDate:   '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CalendarPage() {
  const { activeFamily } = useFamilyStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents]           = useState<CalendarEventEx[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [viewMode, setViewMode]       = useState<'month' | 'agenda'>('month');

  /**
   * Local shape for a family member as actually returned by the server.
   */
  type MemberWithUser = {
    id: string;
    role: string;
    color: string;
    user: { id: string; firstName: string; lastName: string; avatarUrl?: string };
  };
  const members = (activeFamily?.members ?? []) as unknown as MemberWithUser[];

  const memberColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.user.id, m.color);
    return map;
  }, [members]);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    if (!activeFamily) return;
    const start = startOfMonth(currentDate);
    const end   = endOfMonth(currentDate);
    const { data } = await api.get(`/families/${activeFamily._id}/calendar/events`, {
      params: { startDate: start.toISOString(), endDate: end.toISOString() },
    });
    setEvents(data.events);
  }, [activeFamily, currentDate]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── Calendar grid days ──────────────────────────────────────────────────────

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd     = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  const dayEvents = (day: Date) =>
    events.filter((e) => isSameDay(new Date(e.startDate), day));

  // ── Agenda grouping ─────────────────────────────────────────────────────────

  const agendaDays = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
    const groups = new Map<string, CalendarEventEx[]>();
    for (const e of sorted) {
      const key = format(new Date(e.startDate), 'yyyy-MM-dd');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries()).map(([key, evts]) => ({
      date:   new Date(`${key}T00:00:00`),
      events: evts,
    }));
  }, [events]);

  // ── Modal helpers ───────────────────────────────────────────────────────────

  const closeModal = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const openCreate = (day?: Date) => {
    setEditingId(null);
    if (day) {
      const s = new Date(day); s.setHours(9, 0, 0, 0);
      const e = new Date(day); e.setHours(10, 0, 0, 0);
      setForm({ ...EMPTY_FORM, startDate: toLocalInputValue(s), endDate: toLocalInputValue(e) });
    } else {
      setForm(EMPTY_FORM);
    }
    setShowForm(true);
  };

  const openEdit = (event: CalendarEventEx) => {
    setEditingId(event._id);
    const rec = event.recurrence;
    setForm({
      title:               event.title,
      description:         event.description ?? '',
      startDate:           toLocalInputValue(new Date(event.startDate)),
      endDate:             toLocalInputValue(new Date(event.endDate)),
      allDay:              event.allDay,
      assignedTo:          (event.assignedTo ?? []).map((u) => u.id),
      recurrenceEnabled:   !!rec,
      recurrenceFrequency: rec?.frequency  ?? 'weekly',
      recurrenceInterval:  rec?.interval   ?? 1,
      recurrenceDays:      rec?.daysOfWeek ?? [],
      recurrenceEndDate:   rec?.endDate    ? rec.endDate.slice(0, 10) : '',
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

  const toggleDow = (day: number) => {
    setForm((f) => ({
      ...f,
      recurrenceDays: f.recurrenceDays.includes(day)
        ? f.recurrenceDays.filter((d) => d !== day)
        : [...f.recurrenceDays, day],
    }));
  };

  // ── Save / Delete ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!activeFamily || !form.title) return;
    try {
      const recurrence: RecurrenceRule | null = form.recurrenceEnabled
        ? {
            frequency: form.recurrenceFrequency,
            interval:  form.recurrenceInterval,
            ...(form.recurrenceFrequency === 'weekly' && form.recurrenceDays.length > 0
              ? { daysOfWeek: form.recurrenceDays }
              : {}),
            ...(form.recurrenceEndDate
              ? { endDate: new Date(form.recurrenceEndDate).toISOString() }
              : {}),
          }
        : null;

      const payload = {
        title:       form.title,
        description: form.description,
        allDay:      form.allDay,
        startDate:   form.startDate ? new Date(form.startDate).toISOString() : undefined,
        endDate:     form.endDate   ? new Date(form.endDate).toISOString()   : undefined,
        assignedTo:  form.assignedTo,
        recurrence,
      };

      if (editingId) {
        await api.patch(`/families/${activeFamily._id}/calendar/events/${editingId}`, payload);
        toast.success('Événement modifié');
      } else {
        await api.post(`/families/${activeFamily._id}/calendar/events`, payload);
        toast.success('Événement créé');
      }
      closeModal();
      fetchEvents();
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async () => {
    if (!activeFamily || !editingId) return;
    const msg = form.recurrenceEnabled
      ? 'Supprimer toutes les occurrences de cet événement récurrent ?'
      : 'Supprimer cet événement ?';
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/families/${activeFamily._id}/calendar/events/${editingId}`);
      toast.success('Événement supprimé');
      closeModal();
      fetchEvents();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Calendrier</h2>
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 transition ${
                viewMode === 'month'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Mois
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1 transition ${
                viewMode === 'agenda'
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Agenda
            </button>
          </div>

          <Button onClick={() => openCreate()} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Événement
          </Button>
        </div>
      </div>

      {/* ── Month navigation (shared) ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentDate(subMonths(currentDate, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold capitalize">
          {format(currentDate, 'MMMM yyyy', { locale: fr })}
        </h3>
        <button
          onClick={() => setCurrentDate(addMonths(currentDate, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* ══ Month grid ══════════════════════════════════════════════════════════ */}
      {viewMode === 'month' && (
        <>
          <div className="card overflow-hidden">
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 bg-gray-50 dark:bg-gray-800">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <div key={d} className="p-2 text-center text-xs font-medium text-gray-500">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isToday        = isSameDay(day, new Date());
                const evts           = dayEvents(day);
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-2 min-h-[80px] border-t border-r border-gray-100 dark:border-gray-700 ${
                      !isCurrentMonth ? 'opacity-40' : ''
                    }`}
                  >
                    {/* Day number — clicking creates an event on that day */}
                    <button
                      type="button"
                      onClick={() => openCreate(day)}
                      className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-800 rounded -m-1 p-1"
                    >
                      <span
                        className={`text-sm ${
                          isToday
                            ? 'bg-primary-600 text-white w-6 h-6 rounded-full inline-flex items-center justify-center'
                            : ''
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                    </button>

                    {/* Event chips */}
                    <div className="mt-1 space-y-0.5">
                      {evts.slice(0, 3).map((e) => (
                        <button
                          key={`${e._id}-${e.startDate}`}
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-calendar/10 text-calendar hover:bg-calendar/20 flex items-center gap-1"
                          title={e.title}
                        >
                          {e.recurrence && (
                            <Repeat
                              className="w-2 h-2 shrink-0 opacity-70"
                              aria-label="Récurrent"
                            />
                          )}
                          <span className="truncate flex-1">{e.title}</span>
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
                      {evts.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{evts.length - 3}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {events.length === 0 && (
            <EmptyState
              icon={<CalendarIcon className="w-12 h-12" />}
              title="Aucun événement"
              description="Ajoutez votre premier événement familial"
              action={<Button onClick={() => openCreate()} size="sm">Ajouter</Button>}
            />
          )}
        </>
      )}

      {/* ══ Agenda view ═════════════════════════════════════════════════════════ */}
      {viewMode === 'agenda' && (
        <div className="space-y-3">
          {agendaDays.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon className="w-12 h-12" />}
              title="Aucun événement ce mois-ci"
              description="Ajoutez votre premier événement familial"
              action={<Button onClick={() => openCreate()} size="sm">Ajouter</Button>}
            />
          ) : (
            agendaDays.map(({ date, events: dayEvts }) => (
              <div key={date.toISOString()} className="card overflow-hidden">
                {/* Day header */}
                <div
                  className={`px-4 py-2 text-sm font-semibold capitalize ${
                    isSameDay(date, new Date())
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {format(date, 'EEEE d MMMM', { locale: fr })}
                </div>

                {/* Event rows */}
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {dayEvts.map((e) => (
                    <button
                      key={`${e._id}-${e.startDate}`}
                      type="button"
                      onClick={() => openEdit(e)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-3"
                    >
                      {/* Time column */}
                      <div className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0 text-right">
                        {e.allDay ? (
                          <span className="text-primary-600 font-medium">Toute la journée</span>
                        ) : (
                          <>
                            <div>{format(new Date(e.startDate), 'HH:mm')}</div>
                            <div className="text-gray-400">{format(new Date(e.endDate), 'HH:mm')}</div>
                          </>
                        )}
                      </div>

                      {/* Coloured bar */}
                      <div className="w-0.5 h-8 rounded-full bg-calendar shrink-0" />

                      {/* Title + description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {e.recurrence && (
                            <Repeat className="w-3 h-3 text-gray-400 shrink-0" aria-label="Récurrent" />
                          )}
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {e.title}
                          </span>
                        </div>
                        {e.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                            {e.description}
                          </p>
                        )}
                      </div>

                      {/* Assignee avatars */}
                      {e.assignedTo && e.assignedTo.length > 0 && (
                        <div className="flex items-center gap-1 shrink-0">
                          {e.assignedTo.slice(0, 4).map((u) => (
                            <span
                              key={u.id}
                              className="w-6 h-6 rounded-full text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                              style={{ background: memberColorById.get(u.id) ?? '#9ca3af' }}
                              title={`${u.firstName} ${u.lastName}`}
                            >
                              {u.firstName[0].toUpperCase()}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ══ Event form modal ═════════════════════════════════════════════════════ */}
      <Modal
        isOpen={showForm}
        onClose={closeModal}
        title={editingId ? "Modifier l'événement" : 'Nouvel événement'}
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
              label="Début"
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

          {/* ── Assignees ──────────────────────────────────────────────────── */}
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

          {/* ── Recurrence section ─────────────────────────────────────────── */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Toggle row */}
            <label className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <Repeat className="w-4 h-4" />
                Récurrence
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                role="switch"
                aria-checked={form.recurrenceEnabled}
                onClick={() => setForm((f) => ({ ...f, recurrenceEnabled: !f.recurrenceEnabled }))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                  form.recurrenceEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    form.recurrenceEnabled ? 'translate-x-4' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            {/* Options — shown when recurrence is on */}
            {form.recurrenceEnabled && (
              <div className="px-4 pb-4 pt-3 space-y-3 border-t border-gray-100 dark:border-gray-700">
                {/* Frequency */}
                <div>
                  <p className="text-xs text-gray-500 mb-2">Fréquence</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, recurrenceFrequency: freq }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                          form.recurrenceFrequency === freq
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {FREQ_LABELS[freq]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interval */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0">Tous les</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.recurrenceInterval}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        recurrenceInterval: Math.max(1, parseInt(e.target.value) || 1),
                      }))
                    }
                    className="w-16 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-center"
                  />
                  <span className="text-xs text-gray-500">
                    {FREQ_LABELS[form.recurrenceFrequency].toLowerCase()}
                    {form.recurrenceInterval > 1 ? 's' : ''}
                  </span>
                </div>

                {/* Days-of-week selector (weekly only) */}
                {form.recurrenceFrequency === 'weekly' && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Jours</p>
                    <div className="flex gap-1">
                      {DOW_LABELS.map((label, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDow(idx)}
                          className={`flex-1 py-1 text-[11px] font-medium rounded transition ${
                            form.recurrenceDays.includes(idx)
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* End date */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Date de fin (optionnel)
                  </label>
                  <input
                    type="date"
                    value={form.recurrenceEndDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurrenceEndDate: e.target.value }))
                    }
                    className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              {editingId ? 'Enregistrer' : "Créer l'événement"}
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

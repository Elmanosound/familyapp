import { useState, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
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

export function CalendarPage() {
  const { activeFamily } = useFamilyStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // `startDate` / `endDate` are stored as local datetime strings
  // ("YYYY-MM-DDTHH:mm") to match what <input type="datetime-local"> uses.
  // They are converted to a UTC ISO string only when POSTing to the API.
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', allDay: false });

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

  const handleCreate = async () => {
    if (!activeFamily || !form.title) return;
    try {
      // Convert the local datetime strings to UTC ISO for the server.
      // `new Date("2026-04-15T14:30")` parses as local time, toISOString()
      // then correctly yields the UTC equivalent.
      const startLocal = form.startDate || (selectedDate && toLocalInputValue(selectedDate));
      const endLocal = form.endDate || (selectedDate && toLocalInputValue(selectedDate));
      await api.post(`/families/${activeFamily._id}/calendar/events`, {
        title: form.title,
        description: form.description,
        allDay: form.allDay,
        startDate: startLocal ? new Date(startLocal).toISOString() : undefined,
        endDate: endLocal ? new Date(endLocal).toISOString() : undefined,
        assignedTo: [],
      });
      toast.success('Evenement cree');
      setShowForm(false);
      setForm({ title: '', description: '', startDate: '', endDate: '', allDay: false });
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
        <Button onClick={() => setShowForm(true)} size="sm">
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
              <button
                key={day.toISOString()}
                onClick={() => {
                  setSelectedDate(day);
                  setShowForm(true);
                  // Pre-fill with the clicked day at 09:00 local time so the
                  // form displays a sensible time rather than midnight UTC.
                  const defaultStart = new Date(day);
                  defaultStart.setHours(9, 0, 0, 0);
                  const defaultEnd = new Date(day);
                  defaultEnd.setHours(10, 0, 0, 0);
                  setForm((f) => ({
                    ...f,
                    startDate: toLocalInputValue(defaultStart),
                    endDate: toLocalInputValue(defaultEnd),
                  }));
                }}
                className={`p-2 min-h-[80px] border-t border-r border-gray-100 dark:border-gray-700 text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${!isCurrentMonth ? 'opacity-40' : ''}`}
              >
                <span className={`text-sm ${isToday ? 'bg-primary-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''}`}>
                  {format(day, 'd')}
                </span>
                <div className="mt-1 space-y-0.5">
                  {evts.slice(0, 2).map((e) => (
                    <div key={e._id} className="text-[10px] px-1 py-0.5 rounded bg-calendar/10 text-calendar truncate">
                      {e.title}
                    </div>
                  ))}
                  {evts.length > 2 && <span className="text-[10px] text-gray-500">+{evts.length - 2}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {events.length === 0 && (
        <EmptyState
          icon={<CalendarIcon className="w-12 h-12" />}
          title="Aucun evenement"
          description="Ajoutez votre premier evenement familial"
          action={<Button onClick={() => setShowForm(true)} size="sm">Ajouter</Button>}
        />
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="Nouvel evenement">
        <div className="space-y-4">
          <Input label="Titre" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Debut" type="datetime-local" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            <Input label="Fin" type="datetime-local" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <Button onClick={handleCreate} className="w-full">Creer l'evenement</Button>
        </div>
      </Modal>
    </div>
  );
}

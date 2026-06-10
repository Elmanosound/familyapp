import { useState, useMemo } from 'react';
import {
  Droplets, Syringe, Utensils, Activity, Settings,
  Plus, Trash2, ChevronLeft, ChevronRight, TrendingUp,
  TrendingDown, Minus, BarChart2, BookOpen, LayoutDashboard,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from 'recharts';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  useDiabetesStore,
  toDisplay, fromDisplay, glucoseStatus,
  STATUS_LABELS, STATUS_COLORS, STATUS_TEXT_COLORS,
  CONTEXT_LABELS, INTENSITY_LABELS,
  type GlucoseContext, type InsulinType, type ActivityIntensity, type GlucoseUnit,
} from '../stores/diabetesStore';

// ── Types for add-entry modal ─────────────────────────────────────────────────

type EntryType = 'glucose' | 'insulin' | 'meal' | 'activity';

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Add Entry Modal ───────────────────────────────────────────────────────────

interface AddEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: EntryType;
}

function AddEntryModal({ isOpen, onClose, initialType = 'glucose' }: AddEntryModalProps) {
  const {
    settings, addGlucose, addInsulin, addMeal, addActivity,
  } = useDiabetesStore();
  const [type, setType] = useState<EntryType>(initialType);
  const [timestamp, setTimestamp] = useState(nowLocal());
  const [note, setNote] = useState('');

  // Glucose
  const [glucoseValue, setGlucoseValue] = useState('');
  const [context, setContext] = useState<GlucoseContext>('other');

  // Insulin
  const [insulinType, setInsulinType] = useState<InsulinType>('rapid');
  const [insulinUnits, setInsulinUnits] = useState('');
  const [insulinName, setInsulinName] = useState('');

  // Meal
  const [mealName, setMealName] = useState('');
  const [carbs, setCarbs] = useState('');

  // Activity
  const [activityName, setActivityName] = useState('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<ActivityIntensity>('moderate');

  function reset() {
    setTimestamp(nowLocal());
    setNote('');
    setGlucoseValue('');
    setContext('other');
    setInsulinType('rapid');
    setInsulinUnits('');
    setInsulinName('');
    setMealName('');
    setCarbs('');
    setActivityName('');
    setDuration('');
    setIntensity('moderate');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    const ts = new Date(timestamp).toISOString();
    if (type === 'glucose') {
      const v = parseFloat(glucoseValue);
      if (isNaN(v) || v <= 0) return;
      addGlucose({ timestamp: ts, value: fromDisplay(v, settings.unit), context, note: note || undefined });
    } else if (type === 'insulin') {
      const u = parseFloat(insulinUnits);
      if (isNaN(u) || u <= 0) return;
      addInsulin({ timestamp: ts, type: insulinType, units: u, insulinName: insulinName || undefined, note: note || undefined });
    } else if (type === 'meal') {
      if (!mealName.trim()) return;
      const c = parseFloat(carbs);
      addMeal({ timestamp: ts, name: mealName.trim(), carbs: isNaN(c) ? 0 : c, note: note || undefined });
    } else if (type === 'activity') {
      if (!activityName.trim()) return;
      const d = parseFloat(duration);
      addActivity({ timestamp: ts, activity: activityName.trim(), duration: isNaN(d) ? 0 : d, intensity, note: note || undefined });
    }
    handleClose();
  }

  const tabs: { id: EntryType; label: string; icon: React.ReactNode }[] = [
    { id: 'glucose', label: 'Glycémie', icon: <Droplets className="w-4 h-4" /> },
    { id: 'insulin', label: 'Insuline', icon: <Syringe className="w-4 h-4" /> },
    { id: 'meal', label: 'Repas', icon: <Utensils className="w-4 h-4" /> },
    { id: 'activity', label: 'Activité', icon: <Activity className="w-4 h-4" /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Nouvelle entrée">
      {/* Entry type tabs */}
      <div className="grid grid-cols-4 gap-1 mb-4 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md text-xs font-medium transition-colors ${
              type === t.id
                ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            <span className="hidden sm:block">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {/* Timestamp */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date et heure
          </label>
          <input
            type="datetime-local"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Glucose fields */}
        {type === 'glucose' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Glycémie ({settings.unit})
              </label>
              <input
                type="number"
                step={settings.unit === 'mmol/L' ? '0.1' : '1'}
                min="0"
                placeholder={settings.unit === 'mmol/L' ? 'ex: 5.5' : 'ex: 100'}
                value={glucoseValue}
                onChange={(e) => setGlucoseValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contexte
              </label>
              <select
                value={context}
                onChange={(e) => setContext(e.target.value as GlucoseContext)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {(Object.entries(CONTEXT_LABELS) as [GlucoseContext, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {/* Insulin fields */}
        {type === 'insulin' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Type d&apos;insuline
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['rapid', 'slow'] as InsulinType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setInsulinType(t)}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                      insulinType === t
                        ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {t === 'rapid' ? '⚡ Rapide' : '🕐 Lente'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Unités (UI)
              </label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="ex: 4"
                value={insulinUnits}
                onChange={(e) => setInsulinUnits(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                autoFocus
              />
            </div>
            <Input
              label="Nom du médicament (optionnel)"
              value={insulinName}
              onChange={(e) => setInsulinName(e.target.value)}
              placeholder="ex: Novorapid, Lantus…"
            />
          </>
        )}

        {/* Meal fields */}
        {type === 'meal' && (
          <>
            <Input
              label="Nom du repas"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="ex: Déjeuner, Collation…"
              autoFocus
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Glucides (g)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="ex: 45"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {/* Activity fields */}
        {type === 'activity' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Activité
              </label>
              <select
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Choisir…</option>
                {['Marche', 'Course', 'Vélo', 'Natation', 'Gym', 'Yoga', 'Football', 'Tennis', 'Autre'].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Durée (minutes)
              </label>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="ex: 30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Intensité
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.entries(INTENSITY_LABELS) as [ActivityIntensity, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setIntensity(k)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      intensity === k
                        ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Note */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Note (optionnel)
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Commentaire libre…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
        </div>

        <Button onClick={handleSubmit} className="w-full">Enregistrer</Button>
      </div>
    </Modal>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab({ onAdd }: { onAdd: (type: EntryType) => void }) {
  const { glucose, insulin, meals, activities, settings } = useDiabetesStore();

  const latest = useMemo(
    () => [...glucose].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0],
    [glucose],
  );

  const todayGlucose = useMemo(() => {
    const start = startOfDay(new Date()).getTime();
    return glucose.filter((r) => new Date(r.timestamp).getTime() >= start);
  }, [glucose]);

  const avgToday = useMemo(() => {
    if (!todayGlucose.length) return null;
    return todayGlucose.reduce((s, r) => s + r.value, 0) / todayGlucose.length;
  }, [todayGlucose]);

  const tirToday = useMemo(() => {
    if (!todayGlucose.length) return null;
    const inRange = todayGlucose.filter(
      (r) => r.value >= settings.targetLow && r.value <= settings.targetHigh,
    ).length;
    return Math.round((inRange / todayGlucose.length) * 100);
  }, [todayGlucose, settings]);

  // Last 5 entries across all types, sorted by time
  const recentEntries = useMemo(() => {
    type AnyEntry = { id: string; timestamp: string; kind: EntryType; label: string; sub?: string; value?: number };
    const all: AnyEntry[] = [
      ...glucose.map((r) => ({
        id: r.id, timestamp: r.timestamp, kind: 'glucose' as EntryType,
        label: `${toDisplay(r.value, settings.unit)} ${settings.unit}`,
        sub: CONTEXT_LABELS[r.context],
        value: r.value,
      })),
      ...insulin.map((d) => ({
        id: d.id, timestamp: d.timestamp, kind: 'insulin' as EntryType,
        label: `${d.units} UI ${d.type === 'rapid' ? 'rapide' : 'lente'}`,
        sub: d.insulinName,
      })),
      ...meals.map((m) => ({
        id: m.id, timestamp: m.timestamp, kind: 'meal' as EntryType,
        label: m.name, sub: `${m.carbs}g glucides`,
      })),
      ...activities.map((a) => ({
        id: a.id, timestamp: a.timestamp, kind: 'activity' as EntryType,
        label: a.activity, sub: `${a.duration} min · ${INTENSITY_LABELS[a.intensity]}`,
      })),
    ];
    return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);
  }, [glucose, insulin, meals, activities, settings]);

  const latestStatus = latest ? glucoseStatus(latest.value, settings) : null;
  const latestAge = latest
    ? (() => {
        const diffMs = Date.now() - new Date(latest.timestamp).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 60) return `Il y a ${mins} min`;
        const h = Math.floor(mins / 60);
        return `Il y a ${h}h${mins % 60 > 0 ? (mins % 60) + 'min' : ''}`;
      })()
    : null;

  const trendIcon = useMemo(() => {
    if (glucose.length < 2) return null;
    const sorted = [...glucose].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const diff = sorted[0].value - sorted[1].value;
    if (diff > 10) return <TrendingUp className="w-5 h-5 text-orange-500" />;
    if (diff < -10) return <TrendingDown className="w-5 h-5 text-blue-500" />;
    return <Minus className="w-5 h-5 text-gray-400" />;
  }, [glucose]);

  const entryIcons: Record<EntryType, React.ReactNode> = {
    glucose: <Droplets className="w-4 h-4 text-blue-500" />,
    insulin: <Syringe className="w-4 h-4 text-purple-500" />,
    meal: <Utensils className="w-4 h-4 text-orange-500" />,
    activity: <Activity className="w-4 h-4 text-green-500" />,
  };

  return (
    <div className="space-y-4">
      {/* Latest glucose card */}
      <div
        className={`rounded-xl border-2 p-5 ${
          latestStatus ? STATUS_COLORS[latestStatus] : 'bg-gray-50 border-gray-200 text-gray-500'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-70">Dernière glycémie</p>
            {latest ? (
              <>
                <div className="flex items-end gap-2 mt-1">
                  <span className="text-5xl font-bold">{toDisplay(latest.value, settings.unit)}</span>
                  <span className="text-lg font-medium mb-1 opacity-70">{settings.unit}</span>
                  {trendIcon}
                </div>
                <p className="text-sm mt-1 opacity-80">
                  {latestAge} · {CONTEXT_LABELS[latest.context]}
                </p>
                {latestStatus && (
                  <span className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-white/50">
                    {STATUS_LABELS[latestStatus]}
                  </span>
                )}
              </>
            ) : (
              <p className="text-2xl font-bold mt-1">–</p>
            )}
          </div>
          <button
            onClick={() => onAdd('glucose')}
            className="w-10 h-10 rounded-full bg-white/60 hover:bg-white/80 flex items-center justify-center transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {todayGlucose.length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Mesures</p>
        </div>
        <div className="card p-3 text-center">
          <p className={`text-2xl font-bold ${avgToday ? STATUS_TEXT_COLORS[glucoseStatus(avgToday, settings)] : 'text-gray-400'}`}>
            {avgToday ? toDisplay(avgToday, settings.unit) : '–'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Moyenne</p>
        </div>
        <div className="card p-3 text-center">
          <p className={`text-2xl font-bold ${tirToday !== null ? (tirToday >= 70 ? 'text-green-600' : tirToday >= 50 ? 'text-orange-500' : 'text-red-500') : 'text-gray-400'}`}>
            {tirToday !== null ? `${tirToday}%` : '–'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">TIR</p>
        </div>
      </div>

      {/* Quick add */}
      <div className="grid grid-cols-4 gap-2">
        {([
          { type: 'glucose' as EntryType, label: 'Glycémie', icon: <Droplets className="w-5 h-5" />, color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
          { type: 'insulin' as EntryType, label: 'Insuline', icon: <Syringe className="w-5 h-5" />, color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
          { type: 'meal' as EntryType, label: 'Repas', icon: <Utensils className="w-5 h-5" />, color: 'text-orange-600 bg-orange-50 hover:bg-orange-100' },
          { type: 'activity' as EntryType, label: 'Sport', icon: <Activity className="w-5 h-5" />, color: 'text-green-600 bg-green-50 hover:bg-green-100' },
        ] as const).map((item) => (
          <button
            key={item.type}
            onClick={() => onAdd(item.type)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors ${item.color}`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Recent entries */}
      {recentEntries.length > 0 && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-semibold text-sm">Dernières entrées</h3>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {recentEntries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  {entryIcons[e.kind]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.label}</p>
                  {e.sub && <p className="text-xs text-gray-500 truncate">{e.sub}</p>}
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(e.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentEntries.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Droplets className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Aucune entrée pour l&apos;instant</p>
          <p className="text-xs mt-1">Commencez par enregistrer votre glycémie</p>
        </div>
      )}
    </div>
  );
}

// ── Journal Tab ───────────────────────────────────────────────────────────────

function JournalTab() {
  const { glucose, insulin, meals, activities, settings, deleteGlucose, deleteInsulin, deleteMeal, deleteActivity } = useDiabetesStore();

  type AnyEntry = {
    id: string; timestamp: string; kind: EntryType;
    primary: string; secondary?: string; tertiary?: string;
    glucoseValue?: number;
  };

  const allEntries: AnyEntry[] = useMemo(() => {
    return [
      ...glucose.map((r) => ({
        id: r.id, timestamp: r.timestamp, kind: 'glucose' as EntryType,
        primary: `${toDisplay(r.value, settings.unit)} ${settings.unit}`,
        secondary: CONTEXT_LABELS[r.context],
        tertiary: r.note,
        glucoseValue: r.value,
      })),
      ...insulin.map((d) => ({
        id: d.id, timestamp: d.timestamp, kind: 'insulin' as EntryType,
        primary: `${d.units} UI · ${d.type === 'rapid' ? 'Rapide' : 'Lente'}`,
        secondary: d.insulinName,
        tertiary: d.note,
      })),
      ...meals.map((m) => ({
        id: m.id, timestamp: m.timestamp, kind: 'meal' as EntryType,
        primary: m.name,
        secondary: `${m.carbs}g de glucides`,
        tertiary: m.note,
      })),
      ...activities.map((a) => ({
        id: a.id, timestamp: a.timestamp, kind: 'activity' as EntryType,
        primary: a.activity,
        secondary: `${a.duration} min · ${INTENSITY_LABELS[a.intensity]}`,
        tertiary: a.note,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [glucose, insulin, meals, activities, settings]);

  // Group by day
  const grouped = useMemo(() => {
    const groups = new Map<string, AnyEntry[]>();
    for (const e of allEntries) {
      const key = new Date(e.timestamp).toDateString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    return Array.from(groups.entries());
  }, [allEntries]);

  function handleDelete(e: AnyEntry) {
    if (!confirm('Supprimer cette entrée ?')) return;
    if (e.kind === 'glucose') deleteGlucose(e.id);
    else if (e.kind === 'insulin') deleteInsulin(e.id);
    else if (e.kind === 'meal') deleteMeal(e.id);
    else if (e.kind === 'activity') deleteActivity(e.id);
  }

  const kindConfig: Record<EntryType, { icon: React.ReactNode; bg: string }> = {
    glucose: { icon: <Droplets className="w-4 h-4 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20' },
    insulin: { icon: <Syringe className="w-4 h-4 text-purple-500" />, bg: 'bg-purple-50 dark:bg-purple-900/20' },
    meal: { icon: <Utensils className="w-4 h-4 text-orange-500" />, bg: 'bg-orange-50 dark:bg-orange-900/20' },
    activity: { icon: <Activity className="w-4 h-4 text-green-500" />, bg: 'bg-green-50 dark:bg-green-900/20' },
  };

  if (allEntries.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Journal vide</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {grouped.map(([dayKey, entries]) => (
        <div key={dayKey} className="card overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {formatDate(entries[0].timestamp)}
            </p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {entries.map((e) => {
              const status = e.kind === 'glucose' && e.glucoseValue !== undefined
                ? glucoseStatus(e.glucoseValue, settings) : null;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full ${kindConfig[e.kind].bg} flex items-center justify-center flex-shrink-0`}>
                    {kindConfig[e.kind].icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${status ? STATUS_TEXT_COLORS[status] : 'text-gray-800 dark:text-gray-100'}`}>
                      {e.primary}
                    </p>
                    {e.secondary && <p className="text-xs text-gray-500">{e.secondary}</p>}
                    {e.tertiary && <p className="text-xs text-gray-400 italic">{e.tertiary}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs text-gray-400">{formatTime(e.timestamp)}</span>
                    <button
                      onClick={() => handleDelete(e)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────

type Period = '24h' | '7j' | '30j';

function StatsTab() {
  const { glucose, settings } = useDiabetesStore();
  const [period, setPeriod] = useState<Period>('7j');

  const filteredData = useMemo(() => {
    const now = Date.now();
    const cutoff = period === '24h' ? 24 * 3600000 : period === '7j' ? 7 * 86400000 : 30 * 86400000;
    return glucose
      .filter((r) => now - new Date(r.timestamp).getTime() <= cutoff)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [glucose, period]);

  const chartData = useMemo(() =>
    filteredData.map((r) => ({
      time: period === '24h'
        ? new Date(r.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : formatDateShort(r.timestamp),
      value: settings.unit === 'mmol/L'
        ? parseFloat((r.value / 18.0182).toFixed(1))
        : Math.round(r.value),
      ts: new Date(r.timestamp).getTime(),
    })),
  [filteredData, period, settings.unit]);

  const stats = useMemo(() => {
    if (!filteredData.length) return null;
    const vals = filteredData.map((r) => r.value);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const inRange = vals.filter((v) => v >= settings.targetLow && v <= settings.targetHigh).length;
    const tir = Math.round((inRange / vals.length) * 100);
    const hypo = vals.filter((v) => v < settings.hypoThreshold).length;
    const hyper = vals.filter((v) => v > settings.hyperThreshold).length;
    return { avg, min, max, tir, hypo, hyper, count: vals.length };
  }, [filteredData, settings]);

  const yDomain = useMemo(() => {
    const low = settings.unit === 'mmol/L' ? 2 : 40;
    const high = settings.unit === 'mmol/L' ? 20 : 360;
    return [low, high];
  }, [settings.unit]);

  const targetLowDisplay = settings.unit === 'mmol/L'
    ? parseFloat((settings.targetLow / 18.0182).toFixed(1))
    : settings.targetLow;
  const targetHighDisplay = settings.unit === 'mmol/L'
    ? parseFloat((settings.targetHigh / 18.0182).toFixed(1))
    : settings.targetHigh;
  const hypoDisplay = settings.unit === 'mmol/L'
    ? parseFloat((settings.hypoThreshold / 18.0182).toFixed(1))
    : settings.hypoThreshold;
  const hyperDisplay = settings.unit === 'mmol/L'
    ? parseFloat((settings.hyperThreshold / 18.0182).toFixed(1))
    : settings.hyperThreshold;

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
        {(['24h', '7j', '30j'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
              period === p
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Courbe glycémique</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tick={{ fontSize: 10 }}
                tickLine={false}
                unit={settings.unit === 'mmol/L' ? '' : ''}
              />
              <Tooltip
                formatter={(value: number) => [`${value} ${settings.unit}`, 'Glycémie']}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              />
              {/* Target band */}
              <ReferenceArea y1={targetLowDisplay} y2={targetHighDisplay} fill="#22c55e" fillOpacity={0.08} />
              {/* Hypo line */}
              <ReferenceLine y={hypoDisplay} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} />
              {/* Hyper line */}
              <ReferenceLine y={hyperDisplay} stroke="#f97316" strokeDasharray="4 4" strokeWidth={1.5} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">
            Aucune donnée sur cette période
          </div>
        )}
        <div className="flex gap-3 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> Hypo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-200 inline-block rounded" /> Cible</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-orange-400 inline-block" /> Hyper</span>
        </div>
      </div>

      {/* Stats cards */}
      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4 text-center">
              <p className={`text-3xl font-bold ${STATUS_TEXT_COLORS[glucoseStatus(stats.avg, settings)]}`}>
                {toDisplay(stats.avg, settings.unit)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Moyenne {settings.unit}</p>
            </div>
            <div className="card p-4 text-center">
              <p className={`text-3xl font-bold ${stats.tir >= 70 ? 'text-green-600' : stats.tir >= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                {stats.tir}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Temps dans la cible</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-blue-500">{toDisplay(stats.min, settings.unit)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Min</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-orange-500">{toDisplay(stats.max, settings.unit)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Max</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-gray-700 dark:text-gray-200">{stats.count}</p>
              <p className="text-xs text-gray-500 mt-0.5">Mesures</p>
            </div>
          </div>

          {/* TIR bar */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3">Répartition des glycémies</h3>
            <div className="space-y-2">
              {[
                { label: 'Hypoglycémie', count: stats.hypo, color: 'bg-red-500' },
                { label: 'Dans la cible', count: Math.round(stats.count * stats.tir / 100), color: 'bg-green-500' },
                { label: 'Hyperglycémie', count: stats.hyper, color: 'bg-orange-500' },
              ].map(({ label, count, color }) => {
                const pct = stats.count > 0 ? Math.round((count / stats.count) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>{label}</span>
                      <span>{pct}% ({count})</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-gray-400 text-sm">
          Pas assez de données sur cette période
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  const { settings, updateSettings } = useDiabetesStore();

  function handleUnit(unit: GlucoseUnit) {
    updateSettings({ unit });
  }

  function handleNumberSetting(key: keyof typeof settings, raw: string) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) updateSettings({ [key]: parsed });
  }

  function displaySettingValue(mgdl: number): string {
    return settings.unit === 'mmol/L' ? (mgdl / 18.0182).toFixed(1) : mgdl.toString();
  }

  function settingFromInput(val: number): number {
    return settings.unit === 'mmol/L' ? val * 18.0182 : val;
  }

  return (
    <div className="space-y-4">
      {/* Unit */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-3">Unité de glycémie</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['mmol/L', 'mg/dL'] as GlucoseUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => handleUnit(u)}
              className={`py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                settings.unit === u
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Target range */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-1">Plage cible</h3>
        <p className="text-xs text-gray-400 mb-3">Zone verte sur le graphique</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Minimum ({settings.unit})
            </label>
            <input
              type="number"
              step={settings.unit === 'mmol/L' ? '0.1' : '1'}
              defaultValue={displaySettingValue(settings.targetLow)}
              onBlur={(e) => handleNumberSetting('targetLow', String(settingFromInput(parseFloat(e.target.value))))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Maximum ({settings.unit})
            </label>
            <input
              type="number"
              step={settings.unit === 'mmol/L' ? '0.1' : '1'}
              defaultValue={displaySettingValue(settings.targetHigh)}
              onBlur={(e) => handleNumberSetting('targetHigh', String(settingFromInput(parseFloat(e.target.value))))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Thresholds */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-1">Seuils d&apos;alerte</h3>
        <p className="text-xs text-gray-400 mb-3">Lignes rouge/orange sur le graphique</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-red-500 mb-1">
              Hypo ({settings.unit})
            </label>
            <input
              type="number"
              step={settings.unit === 'mmol/L' ? '0.1' : '1'}
              defaultValue={displaySettingValue(settings.hypoThreshold)}
              onBlur={(e) => handleNumberSetting('hypoThreshold', String(settingFromInput(parseFloat(e.target.value))))}
              className="w-full px-3 py-2 border border-red-200 dark:border-red-800 rounded-lg text-sm bg-white dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-orange-500 mb-1">
              Hyper ({settings.unit})
            </label>
            <input
              type="number"
              step={settings.unit === 'mmol/L' ? '0.1' : '1'}
              defaultValue={displaySettingValue(settings.hyperThreshold)}
              onBlur={(e) => handleNumberSetting('hyperThreshold', String(settingFromInput(parseFloat(e.target.value))))}
              className="w-full px-3 py-2 border border-orange-200 dark:border-orange-800 rounded-lg text-sm bg-white dark:bg-gray-700"
            />
          </div>
        </div>
      </div>

      {/* Current defaults info */}
      <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">Valeurs de référence</p>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
          <li>• Cible à jeun : 3,9 – 7,2 mmol/L (70–130 mg/dL)</li>
          <li>• Cible post-prandiale : &lt; 7,8 mmol/L (&lt; 140 mg/dL)</li>
          <li>• Hypoglycémie : &lt; 3,9 mmol/L (&lt; 70 mg/dL)</li>
          <li>• TIR cible : ≥ 70% du temps</li>
        </ul>
      </div>

      <p className="text-xs text-center text-gray-400">
        Toutes les données sont stockées localement sur cet appareil.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'journal' | 'stats' | 'settings';

export function DiabetesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<EntryType>('glucose');

  function openAdd(type: EntryType) {
    setAddType(type);
    setShowAdd(true);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Accueil', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'journal', label: 'Journal', icon: <BookOpen className="w-5 h-5" /> },
    { id: 'stats', label: 'Stats', icon: <BarChart2 className="w-5 h-5" /> },
    { id: 'settings', label: 'Réglages', icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
            <Droplets className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Suivi glycémique</h1>
            <p className="text-xs text-gray-400">Données locales · privées</p>
          </div>
        </div>
        <button
          onClick={() => openAdd('glucose')}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === t.id
                ? 'bg-white dark:bg-gray-600 text-primary-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'dashboard' && <DashboardTab onAdd={openAdd} />}
      {activeTab === 'journal' && <JournalTab />}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'settings' && <SettingsTab />}

      {/* Pagination nav for journal */}
      {activeTab === 'journal' && (
        <div className="flex justify-center gap-4 mt-4 pb-4">
          <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      <AddEntryModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        initialType={addType}
      />
    </div>
  );
}

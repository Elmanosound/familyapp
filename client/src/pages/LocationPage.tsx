import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Navigation, Loader2, MapPinOff } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import api from '../config/api';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';

// ---------------------------------------------------------------------------
// Fix Leaflet default marker icons not loading in bundlers (Vite / Webpack)
// ---------------------------------------------------------------------------
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MemberLocation {
  id: string;
  userId: string;
  familyId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  battery?: number;
  timestamp: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// Helper: build a small circular avatar / initials icon for a member
// ---------------------------------------------------------------------------
function buildAvatarIcon(member: MemberLocation['user']): L.DivIcon {
  const initials = `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();

  const html = member.avatarUrl
    ? `<div style="width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);overflow:hidden;background:#6366f1">
         <img src="${member.avatarUrl}" style="width:100%;height:100%;object-fit:cover" alt="${initials}" />
       </div>`
    : `<div style="width:36px;height:36px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;background:#6366f1;color:#fff;font-size:13px;font-weight:600;line-height:1">
         ${initials}
       </div>`;

  return L.divIcon({
    html,
    className: '', // remove default leaflet-div-icon styling
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// ---------------------------------------------------------------------------
// Small component to recenter map imperatively
// ---------------------------------------------------------------------------
function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 14, { animate: true });
  }, [lat, lng, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function LocationPage() {
  const { activeFamily } = useFamilyStore();
  const [locations, setLocations] = useState<MemberLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [userCenter, setUserCenter] = useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // -----------------------------------------------------------------------
  // Fetch all members' latest location
  // -----------------------------------------------------------------------
  const fetchLocations = useCallback(async () => {
    if (!activeFamily) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/families/${activeFamily._id}/location/members`);
      setLocations(data.locations ?? []);
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  }, [activeFamily]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  // Clean up geolocation watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // Share user position
  // -----------------------------------------------------------------------
  const startSharing = () => {
    if (!navigator.geolocation || !activeFamily) return;
    setSharing(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserCenter({ lat, lng });

        try {
          await api.post(`/families/${activeFamily._id}/location/update`, {
            lat,
            lng,
            accuracy: pos.coords.accuracy,
          });
          fetchLocations();
        } catch {
          /* ignore */
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 30000 },
    );
  };

  // -----------------------------------------------------------------------
  // No family selected
  // -----------------------------------------------------------------------
  if (!activeFamily) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <EmptyState
          icon={<MapPinOff className="w-12 h-12" />}
          title="Aucune famille selectionnee"
          description="Selectionnez ou creez une famille pour acceder a la localisation."
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Default center: France
  // -----------------------------------------------------------------------
  const defaultCenter: [number, number] = [46.6, 2.2];
  const defaultZoom = 6;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Localisation</h2>
        <Button size="sm" onClick={startSharing} disabled={sharing}>
          <Navigation className="w-4 h-4 mr-1" />
          {sharing ? 'Partage actif' : 'Partager ma position'}
        </Button>
      </div>

      {/* Map */}
      <div className="card overflow-hidden mb-4 relative">
        {loading && (
          <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          scrollWheelZoom
          className="h-[450px] w-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Recenter when user shares their location */}
          {userCenter && <RecenterMap lat={userCenter.lat} lng={userCenter.lng} />}

          {/* Member markers */}
          {locations.map((loc) => (
            <Marker
              key={loc.id}
              position={[loc.latitude, loc.longitude]}
              icon={buildAvatarIcon(loc.user)}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-semibold text-sm">
                    {loc.user.firstName} {loc.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </p>
                  {loc.accuracy != null && (
                    <p className="text-xs text-gray-400">
                      Precision : ~{Math.round(loc.accuracy)} m
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(loc.timestamp).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </Popup>

              {/* Accuracy circle */}
              {loc.accuracy != null && loc.accuracy > 0 && (
                <Circle
                  center={[loc.latitude, loc.longitude]}
                  radius={loc.accuracy}
                  pathOptions={{
                    color: '#6366f1',
                    fillColor: '#6366f1',
                    fillOpacity: 0.1,
                    weight: 1,
                  }}
                />
              )}
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Members list below map */}
      <div className="card">
        <h3 className="font-semibold p-4 border-b border-gray-200 dark:border-gray-700">
          Positions des membres
        </h3>
        {locations.length === 0 ? (
          <EmptyState
            icon={<MapPin className="w-12 h-12" />}
            title="Aucune position"
            description="Activez le partage de position pour voir vos proches"
          />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {locations.map((loc) => {
              const initials = `${loc.user.firstName.charAt(0)}${loc.user.lastName.charAt(0)}`.toUpperCase();
              return (
                <div key={loc.id} className="flex items-center gap-3 p-4">
                  {/* Avatar / initials */}
                  <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center overflow-hidden shrink-0">
                    {loc.user.avatarUrl ? (
                      <img
                        src={loc.user.avatarUrl}
                        alt={initials}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-sm font-semibold">{initials}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {loc.user.firstName} {loc.user.lastName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                    </p>
                  </div>

                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {new Date(loc.timestamp).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

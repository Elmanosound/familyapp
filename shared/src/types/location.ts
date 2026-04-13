export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface Location {
  _id: string;
  userId: string;
  familyId: string;
  coordinates: GeoPoint;
  accuracy?: number;
  battery?: number;
  timestamp: string;
  createdAt: string;
}

export interface Geofence {
  _id: string;
  familyId: string;
  name: string;
  center: GeoPoint;
  radius: number;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  watchedMembers: string[];
  createdBy: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocationUpdate {
  lat: number;
  lng: number;
  accuracy?: number;
  battery?: number;
}

export interface CreateGeofenceData {
  name: string;
  lat: number;
  lng: number;
  radius: number;
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  watchedMembers: string[];
}

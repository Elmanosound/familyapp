import type { SendMessageData, Message } from './message';
import type { LocationUpdate } from './location';

// Client -> Server events
export interface ClientToServerEvents {
  'chat:send': (data: { familyId: string } & SendMessageData) => void;
  'chat:typing': (data: { familyId: string }) => void;
  'chat:read': (data: { familyId: string; messageId: string }) => void;
  'location:update': (data: { familyId: string } & LocationUpdate) => void;
  'list:item:toggle': (data: { familyId: string; listId: string; itemId: string }) => void;
  'list:item:add': (data: { familyId: string; listId: string; text: string }) => void;
}

// Server -> Client events
export interface ServerToClientEvents {
  'chat:message': (data: { message: Message }) => void;
  'chat:typing': (data: { familyId: string; userId: string; firstName: string }) => void;
  'chat:read': (data: { messageId: string; userId: string; readAt: string }) => void;
  'location:updated': (data: { userId: string; coordinates: [number, number]; timestamp: string }) => void;
  'location:geofence': (data: { userId: string; geofenceName: string; event: 'enter' | 'exit' }) => void;
  'list:updated': (data: { listId: string; itemId: string; action: 'toggled' | 'added' | 'removed' }) => void;
  'calendar:updated': (data: { eventId: string; action: 'created' | 'updated' | 'deleted' }) => void;
  'family:notification': (data: { type: string; payload: unknown }) => void;
}

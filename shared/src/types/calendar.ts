export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  endDate?: string;
  daysOfWeek?: number[];
}

export interface EventReminder {
  type: 'notification' | 'email';
  minutesBefore: number;
}

/**
 * Subset of a user returned embedded inside a calendar event. The server
 * populates this from the `EventAssignment` join so the client does not
 * need a second roundtrip to render assignee badges.
 */
export interface AssignedUser {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
}

export interface CalendarEvent {
  _id: string;
  familyId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  recurrence?: Recurrence;
  location?: string;
  color?: string;
  createdBy: string;
  /**
   * Users this event is assigned to. The list is populated by the server;
   * when creating or updating an event the client instead sends an array of
   * user IDs via `CreateEventData.assignedTo`.
   */
  assignedTo: AssignedUser[];
  reminders: EventReminder[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventData {
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  recurrence?: Recurrence;
  location?: string;
  color?: string;
  assignedTo: string[];
  reminders?: EventReminder[];
}

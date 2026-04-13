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
  assignedTo: string[];
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

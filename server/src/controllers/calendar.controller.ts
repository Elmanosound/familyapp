import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

const userBasicSelect = { id: true, firstName: true, lastName: true, avatarUrl: true };

// ─── Recurrence helpers ───────────────────────────────────────────────────────

interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval:  number;
  endDate?:  string;       // ISO string cap, absent = no end
  daysOfWeek?: number[];   // 0 = Mon … 6 = Sun (Monday-first, matching date-fns weekStartsOn:1)
}

/** Advance `date` by one recurrence period. */
function advanceDate(date: Date, rule: RecurrenceRule): Date {
  const d = new Date(date);
  switch (rule.frequency) {
    case 'daily':   d.setDate(d.getDate() + rule.interval);           break;
    case 'weekly':  d.setDate(d.getDate() + 7 * rule.interval);       break;
    case 'monthly': d.setMonth(d.getMonth() + rule.interval);         break;
    case 'yearly':  d.setFullYear(d.getFullYear() + rule.interval);   break;
  }
  return d;
}

/**
 * Generate all instances of a recurring event that overlap [rangeStart, rangeEnd].
 * Returns an array of { startDate, endDate } pairs — the caller merges the rest
 * of the event fields.
 */
function expandRecurring(
  template: { startDate: Date; endDate: Date },
  rule: RecurrenceRule,
  rangeStart: Date,
  rangeEnd: Date,
): Array<{ startDate: Date; endDate: Date }> {
  const instances: Array<{ startDate: Date; endDate: Date }> = [];
  const duration  = template.endDate.getTime() - template.startDate.getTime();
  const ruleEnd   = rule.endDate ? new Date(rule.endDate) : null;
  const effectiveEnd = ruleEnd && ruleEnd < rangeEnd ? ruleEnd : rangeEnd;
  const MAX = 500; // safety cap

  if (rule.frequency === 'weekly' && rule.daysOfWeek?.length) {
    // Weekly with specific days: iterate week-by-week (advance by interval weeks)
    // starting from the Monday of the week that contains the template's startDate.
    const origDow     = (template.startDate.getDay() + 6) % 7; // 0 = Mon
    const weekMonday0 = new Date(template.startDate);
    weekMonday0.setDate(weekMonday0.getDate() - origDow);
    weekMonday0.setHours(0, 0, 0, 0);

    let weekMonday = weekMonday0;
    let count = 0;
    while (weekMonday <= effectiveEnd && count < MAX) {
      for (const dow of rule.daysOfWeek) {
        const s = new Date(weekMonday);
        s.setDate(weekMonday.getDate() + dow);
        s.setHours(template.startDate.getHours(), template.startDate.getMinutes(), 0, 0);
        const e = new Date(s.getTime() + duration);

        if (s >= template.startDate && s <= effectiveEnd && e >= rangeStart) {
          instances.push({ startDate: s, endDate: e });
          count++;
        }
      }
      weekMonday = new Date(weekMonday);
      weekMonday.setDate(weekMonday.getDate() + 7 * rule.interval);
    }
  } else {
    let current = new Date(template.startDate);
    let count   = 0;
    while (count < MAX) {
      const end = new Date(current.getTime() + duration);
      if (current > effectiveEnd) break;

      // Include if the instance overlaps the requested range
      if (end >= rangeStart) {
        instances.push({ startDate: new Date(current), endDate: end });
        count++;
      }
      current = advanceDate(current, rule);
    }
  }

  return instances;
}

function parseRecurrence(json: string | null): RecurrenceRule | undefined {
  if (!json) return undefined;
  try { return JSON.parse(json) as RecurrenceRule; }
  catch { return undefined; }
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export async function getEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { startDate, endDate, memberId } = req.query;

    const rangeStart = startDate ? new Date(startDate as string) : null;
    const rangeEnd   = endDate   ? new Date(endDate   as string) : null;

    const baseWhere: Record<string, unknown> = { familyId };
    if (memberId) baseWhere.assignments = { some: { userId: memberId as string } };

    const includeClause = {
      createdBy:   { select: { id: true, firstName: true, lastName: true } },
      assignments: { include: { user: { select: userBasicSelect } } },
    };

    // ── Non-recurring events — standard date-range filter ──────────────────
    const regularWhere: Record<string, unknown> = {
      ...baseWhere,
      recurrence: null,
      ...(rangeStart && rangeEnd
        ? { startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } }
        : {}),
    };

    // ── Recurring templates — only need startDate ≤ rangeEnd ──────────────
    // (they may have started months/years ago and still produce instances now)
    const recurringWhere: Record<string, unknown> = {
      ...baseWhere,
      NOT: { recurrence: null },
      ...(rangeEnd ? { startDate: { lte: rangeEnd } } : {}),
    };

    const [regularEvents, recurringTemplates] = await Promise.all([
      prisma.calendarEvent.findMany({ where: regularWhere, include: includeClause, orderBy: { startDate: 'asc' } }),
      prisma.calendarEvent.findMany({ where: recurringWhere, include: includeClause, orderBy: { startDate: 'asc' } }),
    ]);

    // ── Map a Prisma row → API response shape ──────────────────────────────
    type PrismaEvent = (typeof regularEvents)[0];
    const mapEvent = (
      { assignments, recurrence, ...e }: PrismaEvent,
      startOverride?: Date,
      endOverride?: Date,
    ) => ({
      ...e,
      startDate:  startOverride ?? e.startDate,
      endDate:    endOverride   ?? e.endDate,
      assignedTo: assignments.map((a) => a.user),
      recurrence: parseRecurrence(recurrence),
    });

    const result: ReturnType<typeof mapEvent>[] = regularEvents.map((e) => mapEvent(e));

    // ── Expand recurring templates ─────────────────────────────────────────
    if (rangeStart && rangeEnd) {
      for (const template of recurringTemplates) {
        const rule = parseRecurrence(template.recurrence);
        if (!rule) continue;
        const instances = expandRecurring(template, rule, rangeStart, rangeEnd);
        for (const { startDate: s, endDate: en } of instances) {
          result.push(mapEvent(template, s, en));
        }
      }
    } else {
      result.push(...recurringTemplates.map((e) => mapEvent(e)));
    }

    result.sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    res.json({ events: result });
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedTo, recurrence, ...eventData } = req.body;

    const event = await prisma.calendarEvent.create({
      data: {
        ...eventData,
        startDate: new Date(eventData.startDate),
        endDate:   new Date(eventData.endDate),
        familyId:  req.params.familyId as string,
        createdById: req.user!.id,
        // Store recurrence as a JSON string (Prisma field is String?)
        ...(recurrence != null ? { recurrence: JSON.stringify(recurrence) } : {}),
        ...(assignedTo?.length && {
          assignments: {
            create: (assignedTo as string[]).map((userId: string) => ({ userId })),
          },
        }),
      },
      include: {
        createdBy:   { select: { id: true, firstName: true, lastName: true } },
        assignments: { include: { user: { select: userBasicSelect } } },
      },
    });

    const { assignments, recurrence: rec, ...rest } = event;
    res.status(201).json({
      event: {
        ...rest,
        assignedTo: assignments.map((a) => a.user),
        recurrence: parseRecurrence(rec),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedTo, recurrence, ...updateData } = req.body;
    const eventId = req.params.eventId as string;

    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, familyId: req.params.familyId as string },
    });
    if (!existing) throw new NotFoundError('Event');

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate)   updateData.endDate   = new Date(updateData.endDate);

    // Explicit null clears recurrence; an object serialises it; absent = keep existing
    if (recurrence !== undefined) {
      updateData.recurrence = recurrence ? JSON.stringify(recurrence) : null;
    }

    if (assignedTo) {
      await prisma.eventAssignment.deleteMany({ where: { eventId } });
      await prisma.eventAssignment.createMany({
        data: (assignedTo as string[]).map((userId: string) => ({ eventId, userId })),
      });
    }

    await prisma.calendarEvent.update({ where: { id: eventId }, data: updateData });

    const event = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        createdBy:   { select: { id: true, firstName: true, lastName: true } },
        assignments: { include: { user: { select: userBasicSelect } } },
      },
    });

    const { assignments, recurrence: rec, ...rest } = event;
    res.json({
      event: {
        ...rest,
        assignedTo: assignments.map((a: { user: unknown }) => a.user),
        recurrence: parseRecurrence(rec),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const event = await prisma.calendarEvent.findFirst({
      where: { id: req.params.eventId as string, familyId: req.params.familyId as string },
    });
    if (!event) throw new NotFoundError('Event');

    await prisma.calendarEvent.delete({ where: { id: event.id } });
    res.json({ message: 'Event deleted' });
  } catch (error) {
    next(error);
  }
}

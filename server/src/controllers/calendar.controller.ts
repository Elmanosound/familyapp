import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

const userBasicSelect = { id: true, firstName: true, lastName: true, avatarUrl: true };

export async function getEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { startDate, endDate, memberId } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (startDate && endDate) {
      where.startDate = { lte: new Date(endDate as string) };
      where.endDate = { gte: new Date(startDate as string) };
    }
    if (memberId) {
      where.assignments = { some: { userId: memberId as string } };
    }

    const events = await prisma.calendarEvent.findMany({
      where,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignments: { include: { user: { select: userBasicSelect } } },
      },
      orderBy: { startDate: 'asc' },
    });

    const mapped = events.map(({ assignments, ...e }) => ({
      ...e,
      assignedTo: assignments.map((a) => a.user),
    }));

    res.json({ events: mapped });
  } catch (error) {
    next(error);
  }
}

export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedTo, ...eventData } = req.body;

    const event = await prisma.calendarEvent.create({
      data: {
        ...eventData,
        startDate: new Date(eventData.startDate),
        endDate: new Date(eventData.endDate),
        familyId: req.params.familyId as string,
        createdById: req.user!.id,
        ...(assignedTo?.length && {
          assignments: {
            create: (assignedTo as string[]).map((userId: string) => ({ userId })),
          },
        }),
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignments: { include: { user: { select: userBasicSelect } } },
      },
    });

    const { assignments, ...rest } = event;
    res.status(201).json({
      event: { ...rest, assignedTo: assignments.map((a) => a.user) },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { assignedTo, ...updateData } = req.body;
    const eventId = req.params.eventId as string;

    const existing = await prisma.calendarEvent.findFirst({
      where: { id: eventId, familyId: req.params.familyId as string },
    });
    if (!existing) throw new NotFoundError('Event');

    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
    if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

    if (assignedTo) {
      await prisma.eventAssignment.deleteMany({ where: { eventId } });
      await prisma.eventAssignment.createMany({
        data: (assignedTo as string[]).map((userId: string) => ({ eventId, userId })),
      });
    }

    await prisma.calendarEvent.update({
      where: { id: eventId },
      data: updateData,
    });

    const event = await prisma.calendarEvent.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        assignments: { include: { user: { select: userBasicSelect } } },
      },
    });

    const { assignments, ...rest } = event;
    res.json({
      event: { ...rest, assignedTo: assignments.map((a: { user: unknown }) => a.user) },
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

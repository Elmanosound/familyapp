import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

export async function getMemberLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;

    const members = await prisma.familyMember.findMany({
      where: { familyId },
      select: { userId: true },
    });

    const locations = await Promise.all(
      members.map(async ({ userId }) => {
        const loc = await prisma.location.findFirst({
          where: { userId, familyId },
          orderBy: { timestamp: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        });
        return loc;
      })
    );

    res.json({ locations: locations.filter(Boolean) });
  } catch (error) {
    next(error);
  }
}

export async function updateLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const { lat, lng, accuracy, battery } = req.body;

    const location = await prisma.location.create({
      data: {
        userId: req.user!.id,
        familyId: (req.params.familyId as string),
        latitude: lat,
        longitude: lng,
        accuracy,
        battery,
      },
    });

    res.status(201).json({ location });
  } catch (error) {
    next(error);
  }
}

export async function getGeofences(req: Request, res: Response, next: NextFunction) {
  try {
    const geofences = await prisma.geofence.findMany({
      where: { familyId: (req.params.familyId as string) },
      include: {
        watchedMembers: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    res.json({ geofences });
  } catch (error) {
    next(error);
  }
}

export async function createGeofence(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, lat, lng, radius, notifyOnEntry, notifyOnExit, watchedMembers } = req.body;

    const geofence = await prisma.geofence.create({
      data: {
        familyId: (req.params.familyId as string),
        name,
        centerLat: lat,
        centerLng: lng,
        radius,
        notifyOnEntry: notifyOnEntry ?? true,
        notifyOnExit: notifyOnExit ?? true,
        createdById: req.user!.id,
        ...(watchedMembers?.length && {
          watchedMembers: {
            create: (watchedMembers as string[]).map((userId: string) => ({ userId })),
          },
        }),
      },
      include: {
        watchedMembers: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    res.status(201).json({ geofence });
  } catch (error) {
    next(error);
  }
}

export async function updateGeofence(req: Request, res: Response, next: NextFunction) {
  try {
    const { watchedMembers, lat, lng, ...rest } = req.body;
    const geofenceId = (req.params.geofenceId as string);

    const data: Record<string, unknown> = { ...rest };
    if (lat !== undefined) data.centerLat = lat;
    if (lng !== undefined) data.centerLng = lng;

    if (watchedMembers) {
      await prisma.geofenceWatcher.deleteMany({ where: { geofenceId } });
      await prisma.geofenceWatcher.createMany({
        data: (watchedMembers as string[]).map((userId: string) => ({ geofenceId, userId })),
      });
    }

    const geofence = await prisma.geofence.update({
      where: { id: geofenceId },
      data,
      include: {
        watchedMembers: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    res.json({ geofence });
  } catch (error) {
    next(error);
  }
}

export async function deleteGeofence(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.geofence.delete({ where: { id: (req.params.geofenceId as string) } });
    res.json({ message: 'Geofence deleted' });
  } catch (error) {
    next(error);
  }
}

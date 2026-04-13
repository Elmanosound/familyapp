import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';

export async function requireFamilyMember(req: Request, _res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const userId = req.user!.id;

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });

    if (!member) {
      const family = await prisma.family.findUnique({ where: { id: familyId } });
      if (!family) throw new NotFoundError('Family');
      throw new ForbiddenError('You are not a member of this family');
    }

    next();
  } catch (error) {
    next(error);
  }
}

export async function requireFamilyAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const userId = req.user!.id;

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    });

    if (!member) {
      const family = await prisma.family.findUnique({ where: { id: familyId } });
      if (!family) throw new NotFoundError('Family');
      throw new ForbiddenError('You are not a member of this family');
    }

    if (member.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
}

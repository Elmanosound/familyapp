import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { v4 as uuidv4 } from 'uuid';

const memberSelect = {
  id: true,
  role: true,
  color: true,
  joinedAt: true,
  user: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true },
  },
};

export async function createFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, type } = req.body;
    const userId = req.user!.id;

    const family = await prisma.family.create({
      data: {
        name,
        type: type || 'family',
        createdById: userId,
        members: {
          create: { userId, role: 'admin', color: '#3b82f6' },
        },
      },
      include: { members: { select: memberSelect } },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { activeFamilyId: family.id },
    });

    res.status(201).json({ family });
  } catch (error) {
    next(error);
  }
}

export async function getFamilies(req: Request, res: Response, next: NextFunction) {
  try {
    const families = await prisma.family.findMany({
      where: { members: { some: { userId: req.user!.id } } },
      include: { members: { select: memberSelect } },
    });
    res.json({ families });
  } catch (error) {
    next(error);
  }
}

export async function getFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const family = await prisma.family.findUnique({
      where: { id: req.params.familyId as string },
      include: { members: { select: memberSelect } },
    });
    if (!family) throw new NotFoundError('Family');
    res.json({ family });
  } catch (error) {
    next(error);
  }
}

export async function updateFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, settings } = req.body;
    const family = await prisma.family.update({
      where: { id: req.params.familyId as string },
      data: {
        ...(name && { name }),
        ...(settings && { settings: typeof settings === 'string' ? settings : JSON.stringify(settings) }),
      },
      include: { members: { select: memberSelect } },
    });
    res.json({ family });
  } catch (error) {
    next(error);
  }
}

export async function deleteFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: req.user!.id } },
    });
    if (!member || member.role !== 'admin') {
      throw new ForbiddenError('Only admin can delete family');
    }

    await prisma.user.updateMany({
      where: { activeFamilyId: familyId },
      data: { activeFamilyId: null },
    });

    await prisma.family.delete({ where: { id: familyId } });
    res.json({ message: 'Family deleted' });
  } catch (error) {
    next(error);
  }
}

export async function inviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = req.body;
    const familyId = req.params.familyId as string;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const isMember = await prisma.familyMember.findUnique({
        where: { familyId_userId: { familyId, userId: existingUser.id } },
      });
      if (isMember) throw new ValidationError('User is already a member');
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        familyId,
        invitedById: req.user!.id,
        email,
        role: role || 'member',
        token,
        expiresAt,
      },
    });

    res.status(201).json({ invitation });
  } catch (error) {
    next(error);
  }
}

/**
 * Public — no auth required. Returns the bare minimum about an invitation so
 * the frontend can render "You've been invited to join [name]" before the
 * user has logged in or created an account. Does NOT consume the token.
 */
export async function getInvitationPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token as string },
      include: {
        family: { select: { id: true, name: true, type: true } },
      },
    });
    if (!invitation) throw new NotFoundError('Invitation');

    const isExpired = invitation.expiresAt < new Date();
    res.json({
      invitation: {
        email: invitation.email,
        role: invitation.role,
        status: isExpired ? 'expired' : invitation.status,
        expiresAt: invitation.expiresAt,
        family: invitation.family,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const invitation = await prisma.invitation.findUnique({
      where: { token: req.params.token as string },
    });
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundError('Invitation');
    }
    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new ValidationError('Invitation has expired');
    }

    const userId = req.user!.id;

    const existing = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: invitation.familyId, userId } },
    });
    if (existing) throw new ValidationError('Already a member');

    const randomColor = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

    await prisma.familyMember.create({
      data: {
        familyId: invitation.familyId,
        userId,
        role: invitation.role,
        color: randomColor,
      },
    });

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    });

    const family = await prisma.family.findUnique({
      where: { id: invitation.familyId },
      include: { members: { select: memberSelect } },
    });

    res.json({ family });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const userId = req.params.userId as string;

    await prisma.familyMember.delete({
      where: { familyId_userId: { familyId, userId } },
    });

    await prisma.user.updateMany({
      where: { id: userId, activeFamilyId: familyId },
      data: { activeFamilyId: null },
    });

    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: { members: { select: memberSelect } },
    });

    res.json({ family });
  } catch (error) {
    next(error);
  }
}

export async function switchFamily(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { activeFamilyId: req.params.familyId as string },
    });
    const { password, refreshToken, resetPasswordToken, ...safeUser } = user;
    res.json({ user: safeUser });
  } catch (error) {
    next(error);
  }
}

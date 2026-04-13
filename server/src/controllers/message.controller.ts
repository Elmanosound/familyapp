import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';

const senderSelect = { id: true, firstName: true, lastName: true, avatarUrl: true };

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { cursor, limit = '30' } = req.query;
    const take = parseInt(limit as string, 10);

    const messages = await prisma.message.findMany({
      where: {
        familyId,
        isDeleted: false,
        ...(cursor && { createdAt: { lt: new Date(cursor as string) } }),
      },
      include: { sender: { select: senderSelect } },
      orderBy: { createdAt: 'desc' },
      take,
    });

    res.json({
      messages: messages.reverse(),
      hasMore: messages.length === take,
      nextCursor: messages.length > 0 ? messages[0].createdAt.toISOString() : null,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const message = await prisma.message.create({
      data: {
        familyId: (req.params.familyId as string),
        senderId: req.user!.id,
        type: req.body.type || 'text',
        content: req.body.content,
        mediaUrl: req.body.mediaUrl,
        mediaThumbnailUrl: req.body.mediaThumbnailUrl,
        replyToId: req.body.replyTo,
      },
      include: { sender: { select: senderSelect } },
    });
    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
}

export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.messageReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId: (req.params.messageId as string),
          userId: req.user!.id,
        },
      },
      create: {
        messageId: (req.params.messageId as string),
        userId: req.user!.id,
      },
      update: {
        readAt: new Date(),
      },
    });

    const message = await prisma.message.findUnique({
      where: { id: (req.params.messageId as string) },
      include: {
        sender: { select: senderSelect },
        readBy: { include: { user: { select: { id: true, firstName: true } } } },
      },
    });
    if (!message) throw new NotFoundError('Message');
    res.json({ message });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.message.update({
      where: { id: (req.params.messageId as string) },
      data: { isDeleted: true },
    });
    res.json({ message: 'Message deleted' });
  } catch (error) {
    next(error);
  }
}

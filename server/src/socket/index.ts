import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';

export function initializeSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { familyMembers: { select: { familyId: true } } },
      });
      if (!user) return next(new Error('User not found'));

      socket.data.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info({ userId: user.id }, `User connected: ${user.firstName} ${user.lastName}`);

    // Join all family rooms
    for (const fm of user.familyMembers) {
      socket.join(fm.familyId);
    }

    // Chat: send message
    socket.on('chat:send', async (data) => {
      const { familyId, content, type, replyTo } = data;
      const message = await prisma.message.create({
        data: {
          familyId,
          senderId: user.id,
          type: type || 'text',
          content,
          replyToId: replyTo,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });
      io.to(familyId).emit('chat:message', { message });
    });

    // Chat: typing
    socket.on('chat:typing', (data) => {
      socket.to(data.familyId).emit('chat:typing', {
        familyId: data.familyId,
        userId: user.id,
        firstName: user.firstName,
      });
    });

    // Chat: mark as read
    socket.on('chat:read', async (data) => {
      const { familyId, messageId } = data;
      await prisma.messageReadReceipt.upsert({
        where: { messageId_userId: { messageId, userId: user.id } },
        create: { messageId, userId: user.id },
        update: { readAt: new Date() },
      });
      io.to(familyId).emit('chat:read', {
        messageId,
        userId: user.id,
        readAt: new Date().toISOString(),
      });
    });

    // Location: update
    socket.on('location:update', (data) => {
      const { familyId, lat, lng } = data;
      io.to(familyId).emit('location:updated', {
        userId: user.id,
        coordinates: [lng, lat],
        timestamp: new Date().toISOString(),
      });
    });

    // List: toggle item
    socket.on('list:item:toggle', (data) => {
      const { familyId, listId, itemId } = data;
      io.to(familyId).emit('list:updated', {
        listId,
        itemId,
        action: 'toggled',
      });
    });

    socket.on('disconnect', () => {
      logger.info({ userId: user.id }, `User disconnected: ${user.firstName}`);
    });
  });

  return io;
}

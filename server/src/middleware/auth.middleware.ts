import { Request, Response, NextFunction } from 'express';
import { User } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../config/db.js';
import { UnauthorizedError } from '../utils/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function protect(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    req.user = user;
    next();
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
}

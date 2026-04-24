import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { NotFoundError } from '../utils/errors.js';
import fs from 'fs';
import path from 'path';

export async function getMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = req.params.familyId as string;
    const { albumId, limit = '30', skip = '0' } = req.query;

    const where: Record<string, unknown> = { familyId };
    if (albumId) where.albumId = albumId as string;

    const [media, total] = await Promise.all([
      prisma.media.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, firstName: true, lastName: true } },
          likes: { select: { userId: true } },
          comments: {
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'asc' as const },
          },
          _count: { select: { likes: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip as string, 10),
        take: parseInt(limit as string, 10),
      }),
      prisma.media.count({ where }),
    ]);

    res.json({ media, total });
  } catch (error) {
    next(error);
  }
}

export async function uploadMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const media = await prisma.media.create({
      data: {
        familyId: (req.params.familyId as string),
        uploadedById: req.user!.id,
        type: req.body.type || 'image',
        url: req.body.url,
        thumbnailUrl: req.body.thumbnailUrl,
        originalFilename: req.body.originalFilename,
        fileSize: req.body.fileSize,
        width: req.body.width,
        height: req.body.height,
        duration: req.body.duration,
        caption: req.body.caption,
        albumId: req.body.albumId,
        takenAt: req.body.takenAt ? new Date(req.body.takenAt) : undefined,
      },
    });
    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
}

export async function uploadFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No file provided' });
      return;
    }

    const file = req.file;
    const isVideo = file.mimetype.startsWith('video/');
    const fileUrl = `/uploads/${file.filename}`;

    const media = await prisma.media.create({
      data: {
        familyId: req.params.familyId as string,
        uploadedById: req.user!.id,
        type: isVideo ? 'video' : 'image',
        url: fileUrl,
        thumbnailUrl: isVideo ? undefined : fileUrl,
        originalFilename: file.originalname,
        fileSize: file.size,
        caption: req.body.caption || undefined,
        albumId: req.body.albumId || undefined,
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        likes: { select: { userId: true } },
        comments: true,
      },
    });

    // If the upload is assigned to an album that has no cover yet,
    // automatically use this image as the cover (skip for videos).
    if (req.body.albumId && !isVideo) {
      await prisma.album.updateMany({
        where: { id: req.body.albumId, coverImageUrl: null },
        data:  { coverImageUrl: fileUrl },
      });
    }

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
}

export async function updateMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const mediaId = req.params.mediaId as string;

    const existing = await prisma.media.findFirst({
      where: { id: mediaId, familyId: req.params.familyId as string },
    });
    if (!existing) throw new NotFoundError('Media not found');

    const updated = await prisma.media.update({
      where: { id: mediaId },
      data: {
        ...(req.body.caption  !== undefined && { caption:  req.body.caption  ?? null }),
        ...(req.body.albumId  !== undefined && { albumId:  req.body.albumId  || null }),
      },
      include: {
        uploadedBy: { select: { id: true, firstName: true, lastName: true } },
        likes:      { select: { userId: true } },
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy:  { createdAt: 'asc' },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    res.json({ media: updated });
  } catch (error) {
    next(error);
  }
}

export async function deleteMedia(req: Request, res: Response, next: NextFunction) {
  try {
    const media = await prisma.media.findUnique({ where: { id: req.params.mediaId as string } });
    if (!media) {
      res.status(404).json({ message: 'Media not found' });
      return;
    }

    // Remove file from disk if it's a local upload
    if (media.url.startsWith('/uploads/')) {
      const filePath = path.resolve(process.cwd(), media.url.slice(1)); // remove leading /
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await prisma.media.delete({ where: { id: req.params.mediaId as string } });
    res.json({ message: 'Media deleted' });
  } catch (error) {
    next(error);
  }
}

export async function toggleLike(req: Request, res: Response, next: NextFunction) {
  try {
    const mediaId = (req.params.mediaId as string);
    const userId = req.user!.id;

    const existingLike = await prisma.mediaLike.findUnique({
      where: { mediaId_userId: { mediaId, userId } },
    });

    if (existingLike) {
      await prisma.mediaLike.delete({
        where: { mediaId_userId: { mediaId, userId } },
      });
    } else {
      await prisma.mediaLike.create({ data: { mediaId, userId } });
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        likes: { select: { userId: true } },
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.json({ media });
  } catch (error) {
    next(error);
  }
}

export async function addComment(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.mediaComment.create({
      data: {
        mediaId: (req.params.mediaId as string),
        userId: req.user!.id,
        text: req.body.text,
      },
    });

    const media = await prisma.media.findUnique({
      where: { id: (req.params.mediaId as string) },
      include: {
        likes: { select: { userId: true } },
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    res.json({ media });
  } catch (error) {
    next(error);
  }
}

export async function getAlbums(req: Request, res: Response, next: NextFunction) {
  try {
    const albums = await prisma.album.findMany({
      where: { familyId: (req.params.familyId as string) },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { media: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const albumsWithCount = albums.map((a) => {
      const { _count, ...album } = a as typeof a & { _count: { media: number } };
      return { ...album, mediaCount: _count.media };
    });

    res.json({ albums: albumsWithCount });
  } catch (error) {
    next(error);
  }
}

export async function createAlbum(req: Request, res: Response, next: NextFunction) {
  try {
    const album = await prisma.album.create({
      data: {
        name: req.body.name,
        coverImageUrl: req.body.coverImageUrl,
        familyId: (req.params.familyId as string),
        createdById: req.user!.id,
      },
    });
    res.status(201).json({ album });
  } catch (error) {
    next(error);
  }
}

export async function deleteAlbum(req: Request, res: Response, next: NextFunction) {
  try {
    await prisma.media.updateMany({
      where: { albumId: (req.params.albumId as string) },
      data: { albumId: null },
    });
    await prisma.album.delete({ where: { id: (req.params.albumId as string) } });
    res.json({ message: 'Album deleted' });
  } catch (error) {
    next(error);
  }
}

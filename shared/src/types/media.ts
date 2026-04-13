export type MediaType = 'image' | 'video';

export interface MediaComment {
  _id?: string;
  user: string;
  text: string;
  createdAt: string;
}

export interface Media {
  _id: string;
  familyId: string;
  albumId?: string;
  uploadedBy: string;
  type: MediaType;
  url: string;
  thumbnailUrl: string;
  originalFilename: string;
  fileSize: number;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
  likes: string[];
  comments: MediaComment[];
  takenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Album {
  _id: string;
  familyId: string;
  name: string;
  coverImageUrl?: string;
  createdBy: string;
  mediaCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlbumData {
  name: string;
}

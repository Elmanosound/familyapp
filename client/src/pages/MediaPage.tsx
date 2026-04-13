import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Heart,
  Trash2,
  X,
  Upload,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import api from '../config/api';
import { format } from 'date-fns';

// ---------- Types matching Prisma response ----------
interface MediaUser {
  id: string;
  firstName: string;
  lastName: string;
}

interface MediaLike {
  userId: string;
}

interface MediaComment {
  id: string;
  text: string;
  createdAt: string;
  user: MediaUser;
}

interface MediaItem {
  id: string;
  familyId: string;
  albumId?: string | null;
  uploadedById: string;
  uploadedBy: MediaUser;
  type: string;
  url: string;
  thumbnailUrl?: string | null;
  originalFilename?: string | null;
  fileSize?: number | null;
  caption?: string | null;
  likes: MediaLike[];
  comments: MediaComment[];
  _count: { likes: number; comments: number };
  createdAt: string;
}

// ---------- Constants ----------
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm';

export function MediaPage() {
  const { activeFamily } = useFamilyStore();
  const { user } = useAuthStore();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Fetch media ----
  const fetchMedia = useCallback(async () => {
    if (!activeFamily) return;
    setLoading(true);
    try {
      const familyId = activeFamily._id || (activeFamily as unknown as { id: string }).id;
      const { data } = await api.get(`/families/${familyId}/media`);
      setMedia(data.media ?? []);
    } catch (err) {
      console.error('Failed to fetch media', err);
    } finally {
      setLoading(false);
    }
  }, [activeFamily]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  // ---- Upload file ----
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeFamily) return;

    const familyId = activeFamily._id || (activeFamily as unknown as { id: string }).id;
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      await api.post(`/families/${familyId}/media/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
          }
        },
      });
      await fetchMedia();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message?: string } } }).response?.data?.message
          : 'Upload failed';
      setError(msg || 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ---- Toggle like ----
  const toggleLike = async (mediaId: string) => {
    if (!activeFamily) return;
    const familyId = activeFamily._id || (activeFamily as unknown as { id: string }).id;
    try {
      const { data } = await api.post(`/families/${familyId}/media/${mediaId}/like`);
      // Update in-place for instant feedback
      setMedia((prev) =>
        prev.map((m) =>
          m.id === mediaId
            ? {
                ...m,
                likes: data.media.likes,
                _count: { ...m._count, likes: data.media.likes.length },
              }
            : m
        )
      );
    } catch (err) {
      console.error('Failed to toggle like', err);
    }
  };

  // ---- Delete media ----
  const deleteMedia = async (mediaId: string) => {
    if (!activeFamily) return;
    const familyId = activeFamily._id || (activeFamily as unknown as { id: string }).id;
    try {
      await api.delete(`/families/${familyId}/media/${mediaId}`);
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
      setSelectedIndex(null);
    } catch (err) {
      console.error('Failed to delete media', err);
    }
  };

  // ---- Lightbox helpers ----
  const selectedMedia = selectedIndex !== null ? media[selectedIndex] : null;

  const goNext = () => {
    if (selectedIndex !== null && selectedIndex < media.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const goPrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    if (selectedIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIndex(null);
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, media.length]);

  const isLikedByMe = (item: MediaItem) =>
    user ? item.likes.some((l) => l.userId === user._id || l.userId === (user as unknown as { id: string }).id) : false;

  const isOwnMedia = (item: MediaItem) =>
    user
      ? item.uploadedById === user._id || item.uploadedById === (user as unknown as { id: string }).id
      : false;

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Photos & Videos</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            isLoading={uploading}
          >
            {!uploading && <Plus className="w-4 h-4 mr-1" />}
            {uploading ? `${uploadProgress}%` : 'Ajouter'}
          </Button>
        </div>
      </div>

      {/* Upload progress bar */}
      {uploading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Upload en cours... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && media.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}

      {/* Empty state */}
      {!loading && media.length === 0 && (
        <EmptyState
          icon={<ImageIcon className="w-12 h-12" />}
          title="Aucune photo"
          description="Partagez vos premiers souvenirs familiaux"
        />
      )}

      {/* Gallery grid */}
      {media.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {media.map((m, index) => (
            <button
              key={m.id}
              onClick={() => setSelectedIndex(index)}
              className="relative aspect-square rounded-lg overflow-hidden group bg-gray-100 dark:bg-gray-800"
            >
              {m.type === 'video' ? (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <video
                    src={m.url}
                    className="w-full h-full object-cover"
                    muted
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={m.thumbnailUrl || m.url}
                  alt={m.caption || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end p-2 opacity-0 group-hover:opacity-100">
                <div className="flex gap-3 text-white text-xs">
                  <span className="flex items-center gap-1">
                    <Heart className={`w-3 h-3 ${isLikedByMe(m) ? 'fill-red-500 text-red-500' : ''}`} />
                    {m._count.likes}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedMedia && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedIndex(null);
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedIndex(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation arrows */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 z-10"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {selectedIndex < media.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white p-2 z-10"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Media content */}
          <div className="max-w-5xl w-full px-4" onClick={(e) => e.stopPropagation()}>
            {selectedMedia.type === 'video' ? (
              <video
                src={selectedMedia.url}
                controls
                autoPlay
                className="max-h-[70vh] mx-auto rounded"
              />
            ) : (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.caption || ''}
                className="max-h-[70vh] mx-auto object-contain rounded"
              />
            )}

            {/* Info bar */}
            <div className="mt-4 text-white">
              <div className="flex items-start justify-between">
                <div>
                  {selectedMedia.caption && (
                    <p className="text-lg">{selectedMedia.caption}</p>
                  )}
                  <p className="text-sm text-gray-400 mt-1">
                    {selectedMedia.uploadedBy.firstName} {selectedMedia.uploadedBy.lastName}
                    {' - '}
                    {format(new Date(selectedMedia.createdAt), 'dd/MM/yyyy HH:mm')}
                  </p>
                  {selectedMedia.originalFilename && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedMedia.originalFilename}
                      {selectedMedia.fileSize ? ` (${formatFileSize(selectedMedia.fileSize)})` : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => toggleLike(selectedMedia.id)}
                  className={`flex items-center gap-1.5 transition-colors ${
                    isLikedByMe(selectedMedia)
                      ? 'text-red-500'
                      : 'text-white/70 hover:text-red-400'
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 ${isLikedByMe(selectedMedia) ? 'fill-current' : ''}`}
                  />
                  <span className="text-sm">{selectedMedia.likes.length}</span>
                </button>

                {isOwnMedia(selectedMedia) && (
                  <button
                    onClick={() => {
                      if (window.confirm('Supprimer ce media ?')) {
                        deleteMedia(selectedMedia.id);
                      }
                    }}
                    className="flex items-center gap-1.5 text-white/70 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                    <span className="text-sm">Supprimer</span>
                  </button>
                )}
              </div>

              {/* Counter */}
              <p className="text-xs text-gray-500 mt-3">
                {selectedIndex + 1} / {media.length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

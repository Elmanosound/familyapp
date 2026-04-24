import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Heart,
  Trash2,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Play,
  FolderOpen,
  FolderPlus,
  ArrowLeft,
  MessageSquare,
  Send,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useFamilyStore } from '../stores/familyStore';
import { useAuthStore } from '../stores/authStore';
import api from '../config/api';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MediaUser { id: string; firstName: string; lastName: string; }
interface MediaLike { userId: string; }
interface MediaComment { id: string; text: string; createdAt: string; user: MediaUser; }

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

interface AlbumItem {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  mediaCount: number;
  createdBy: MediaUser;
  createdAt: string;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm';

// ── Component ─────────────────────────────────────────────────────────────────

export function MediaPage() {
  const { activeFamily } = useFamilyStore();
  const { user }         = useAuthStore();

  // Media
  const [media,          setMedia]          = useState<MediaItem[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [uploading,      setUploading]      = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedIndex,  setSelectedIndex]  = useState<number | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Albums
  const [albums,          setAlbums]          = useState<AlbumItem[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [newAlbumName,    setNewAlbumName]    = useState('');
  const [creatingAlbum,   setCreatingAlbum]   = useState(false);

  // Comments (lightbox)
  const [commentText,    setCommentText]    = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const familyId    = activeFamily?._id ?? (activeFamily as unknown as { id?: string })?.id;
  const selectedAlbum = albums.find((a) => a.id === selectedAlbumId) ?? null;

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchAlbums = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data } = await api.get(`/families/${familyId}/media/albums`);
      setAlbums(data.albums ?? []);
    } catch { /* silent — albums section just won't render */ }
  }, [familyId]);

  const fetchMedia = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      const qs = selectedAlbumId ? `?albumId=${selectedAlbumId}` : '';
      const { data } = await api.get(`/families/${familyId}/media${qs}`);
      setMedia(data.media ?? []);
    } catch {
      setError('Impossible de charger les médias');
    } finally {
      setLoading(false);
    }
  }, [familyId, selectedAlbumId]);

  useEffect(() => { fetchAlbums(); }, [fetchAlbums]);
  useEffect(() => { fetchMedia();  }, [fetchMedia]);

  // ── Upload ───────────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !familyId) return;

    const formData = new FormData();
    formData.append('file', file);
    // Upload directly into the current album if one is open
    if (selectedAlbumId) formData.append('albumId', selectedAlbumId);

    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      await api.post(`/families/${familyId}/media/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
        onUploadProgress: (evt) => {
          if (evt.total) setUploadProgress(Math.round((evt.loaded * 100) / evt.total));
        },
      });
      toast.success('Média ajouté !');
      await Promise.all([fetchMedia(), fetchAlbums()]);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response: { data: { message?: string } } }).response?.data?.message
          : undefined;
      const label = msg ?? 'Upload échoué';
      setError(label);
      toast.error(label);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Albums ────────────────────────────────────────────────────────────────────

  const createAlbum = async () => {
    if (!newAlbumName.trim() || !familyId) return;
    setCreatingAlbum(true);
    try {
      await api.post(`/families/${familyId}/media/albums`, { name: newAlbumName.trim() });
      toast.success('Album créé !');
      setNewAlbumName('');
      setShowCreateAlbum(false);
      await fetchAlbums();
    } catch {
      toast.error("Impossible de créer l'album");
    } finally {
      setCreatingAlbum(false);
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    if (!familyId) return;
    if (!window.confirm('Supprimer cet album ? Les photos seront conservées.')) return;
    try {
      await api.delete(`/families/${familyId}/media/albums/${albumId}`);
      toast.success('Album supprimé');
      if (selectedAlbumId === albumId) setSelectedAlbumId(null);
      await fetchAlbums();
    } catch {
      toast.error("Impossible de supprimer l'album");
    }
  };

  // ── Media actions ─────────────────────────────────────────────────────────────

  const toggleLike = async (mediaId: string) => {
    if (!familyId) return;
    try {
      const { data } = await api.post(`/families/${familyId}/media/${mediaId}/like`);
      setMedia((prev) =>
        prev.map((m) =>
          m.id === mediaId
            ? { ...m, likes: data.media.likes, _count: { ...m._count, likes: data.media.likes.length } }
            : m
        )
      );
    } catch { /* optimistic UI — ignore */ }
  };

  const deleteMedia = async (mediaId: string) => {
    if (!familyId) return;
    try {
      await api.delete(`/families/${familyId}/media/${mediaId}`);
      setMedia((prev) => prev.filter((m) => m.id !== mediaId));
      setSelectedIndex(null);
      toast.success('Média supprimé');
      await fetchAlbums();
    } catch {
      toast.error('Impossible de supprimer');
    }
  };

  const moveToAlbum = async (mediaId: string, albumId: string | null) => {
    if (!familyId) return;
    try {
      const { data } = await api.patch(`/families/${familyId}/media/${mediaId}`, { albumId });
      setMedia((prev) =>
        prev.map((m) => (m.id === mediaId ? { ...m, albumId: data.media.albumId } : m))
      );
      toast.success(albumId ? "Ajouté à l'album" : "Retiré de l'album");
      await fetchAlbums();
    } catch {
      toast.error('Impossible de déplacer');
    }
  };

  const addComment = async (mediaId: string) => {
    if (!commentText.trim() || !familyId) return;
    setSendingComment(true);
    try {
      const { data } = await api.post(`/families/${familyId}/media/${mediaId}/comments`, {
        text: commentText.trim(),
      });
      setMedia((prev) =>
        prev.map((m) =>
          m.id === mediaId
            ? { ...m, comments: data.media.comments, _count: { ...m._count, comments: data.media.comments.length } }
            : m
        )
      );
      setCommentText('');
    } catch {
      toast.error("Impossible d'envoyer le commentaire");
    } finally {
      setSendingComment(false);
    }
  };

  // ── Lightbox helpers ──────────────────────────────────────────────────────────

  const selectedMedia = selectedIndex !== null ? media[selectedIndex] : null;

  const goNext = useCallback(() => {
    setSelectedIndex((i) => (i !== null && i < media.length - 1 ? i + 1 : i));
  }, [media.length]);

  const goPrev = useCallback(() => {
    setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  useEffect(() => {
    if (selectedIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setSelectedIndex(null);
      if (e.key === 'ArrowRight')  goNext();
      if (e.key === 'ArrowLeft')   goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, goNext, goPrev]);

  // Reset comment input when navigating in lightbox
  useEffect(() => { setCommentText(''); }, [selectedIndex]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const isLikedByMe = (item: MediaItem) =>
    user
      ? item.likes.some(
          (l) => l.userId === user._id || l.userId === (user as unknown as { id: string }).id
        )
      : false;

  const isOwnMedia = (item: MediaItem) =>
    user
      ? item.uploadedById === user._id ||
        item.uploadedById === (user as unknown as { id: string }).id
      : false;

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return '';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1_048_576)   return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  };

  if (!activeFamily) {
    return (
      <EmptyState
        icon={<ImageIcon className="w-12 h-12" />}
        title="Pas de groupe"
        description="Rejoignez un groupe pour accéder aux médias"
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {selectedAlbumId && (
            <button
              onClick={() => { setSelectedAlbumId(null); setSelectedIndex(null); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {selectedAlbum ? selectedAlbum.name : 'Photos & Vidéos'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {!selectedAlbumId && (
            <Button size="sm" variant="secondary" onClick={() => setShowCreateAlbum(true)}>
              <FolderPlus className="w-4 h-4 mr-1" />
              <span className="hidden sm:inline">Nouvel album</span>
            </Button>
          )}
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

      {/* ── Upload progress ──────────────────────────────── */}
      {uploading && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Upload en cours… {uploadProgress}%
          </p>
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Albums section (main view only) ─────────────── */}
      {!selectedAlbumId && albums.length > 0 && (
        <section className="mb-8">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">
            Albums
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {albums.map((album) => (
              <div key={album.id} className="relative group">
                <button
                  onClick={() => setSelectedAlbumId(album.id)}
                  className="w-full text-left"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 ring-2 ring-transparent group-hover:ring-primary-500 transition-all">
                    {album.coverImageUrl ? (
                      <img
                        src={album.coverImageUrl}
                        alt={album.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FolderOpen className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-gray-900 dark:text-white truncate">
                    {album.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {album.mediaCount} photo{album.mediaCount !== 1 ? 's' : ''}
                  </p>
                </button>

                {/* Delete button — visible on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteAlbum(album.id); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                  title="Supprimer l'album"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Divider before "all photos" */}
          <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">
              Toutes les photos
            </h3>
          </div>
        </section>
      )}

      {/* ── Loading / empty ───────────────────────────────── */}
      {loading && media.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}
      {!loading && media.length === 0 && (
        <EmptyState
          icon={
            selectedAlbumId
              ? <FolderOpen className="w-12 h-12" />
              : <ImageIcon className="w-12 h-12" />
          }
          title={selectedAlbumId ? 'Album vide' : 'Aucune photo'}
          description={
            selectedAlbumId
              ? "Ajoutez une photo avec le bouton « Ajouter »"
              : 'Partagez vos premiers souvenirs familiaux'
          }
        />
      )}

      {/* ── Media grid ───────────────────────────────────── */}
      {media.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {media.map((m, index) => (
            <button
              key={m.id}
              onClick={() => setSelectedIndex(index)}
              className="relative aspect-square rounded-lg overflow-hidden group bg-gray-100 dark:bg-gray-800"
            >
              {m.type === 'video' ? (
                <>
                  <video src={m.url} className="w-full h-full object-cover" muted preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                      <Play className="w-5 h-5 text-white ml-0.5" />
                    </div>
                  </div>
                </>
              ) : (
                <img
                  src={m.thumbnailUrl ?? m.url}
                  alt={m.caption ?? ''}
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
                  {m._count.comments > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {m._count.comments}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Lightbox ─────────────────────────────────────── */}
      {selectedMedia && selectedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col lg:flex-row"
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedIndex(null); }}
        >
          {/* Close */}
          <button
            onClick={() => setSelectedIndex(null)}
            className="absolute top-4 right-4 z-20 text-white/70 hover:text-white p-2"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Prev arrow */}
          {selectedIndex > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 text-white/60 hover:text-white p-2"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {/* Next arrow — offset on desktop to stay left of the side panel */}
          {selectedIndex < media.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute right-3 lg:right-[21rem] top-1/2 -translate-y-1/2 z-20 text-white/60 hover:text-white p-2"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Media */}
          <div
            className="flex-1 flex items-center justify-center p-6 min-h-0 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedMedia.type === 'video' ? (
              <video
                src={selectedMedia.url}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.caption ?? ''}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )}
          </div>

          {/* ── Right panel ─────────────────────────────── */}
          <div
            className="w-full lg:w-80 bg-gray-900 flex flex-col flex-shrink-0 border-t border-gray-700 lg:border-t-0 lg:border-l max-h-[45vh] lg:max-h-none overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Info */}
            <div className="p-4 border-b border-gray-700 flex-shrink-0">
              {selectedMedia.caption && (
                <p className="text-white font-medium mb-1">{selectedMedia.caption}</p>
              )}
              <p className="text-sm text-gray-400">
                {selectedMedia.uploadedBy.firstName} {selectedMedia.uploadedBy.lastName}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {format(new Date(selectedMedia.createdAt), 'dd MMM yyyy · HH:mm', { locale: fr })}
              </p>
              {selectedMedia.fileSize != null && (
                <p className="text-xs text-gray-600 mt-0.5">{formatFileSize(selectedMedia.fileSize)}</p>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3 flex-shrink-0">
              {/* Like */}
              <button
                onClick={() => toggleLike(selectedMedia.id)}
                className={`flex items-center gap-1.5 transition-colors ${
                  isLikedByMe(selectedMedia) ? 'text-red-500' : 'text-white/60 hover:text-red-400'
                }`}
              >
                <Heart className={`w-5 h-5 ${isLikedByMe(selectedMedia) ? 'fill-current' : ''}`} />
                <span className="text-sm">{selectedMedia.likes.length}</span>
              </button>

              {/* Move to album */}
              {albums.length > 0 && (
                <select
                  value={selectedMedia.albumId ?? ''}
                  onChange={(e) => moveToAlbum(selectedMedia.id, e.target.value || null)}
                  className="flex-1 text-xs bg-gray-800 text-gray-300 border border-gray-600 rounded-lg px-2 py-1.5 focus:outline-none focus:border-primary-500 truncate"
                >
                  <option value="">Sans album</option>
                  {albums.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}

              {/* Delete (own media only) */}
              {isOwnMedia(selectedMedia) && (
                <button
                  onClick={() => window.confirm('Supprimer ce média ?') && deleteMedia(selectedMedia.id)}
                  className="text-white/50 hover:text-red-400 transition-colors flex-shrink-0"
                  title="Supprimer"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {selectedMedia.comments.length === 0 ? (
                <p className="text-sm text-gray-600 text-center py-4">Aucun commentaire</p>
              ) : (
                selectedMedia.comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary-700 flex-shrink-0 flex items-center justify-center text-white text-[11px] font-bold">
                      {c.user.firstName[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400 leading-none mb-1">
                        <span className="font-semibold text-gray-300">{c.user.firstName}</span>
                        <span className="mx-1">·</span>
                        {format(new Date(c.createdAt), 'dd/MM HH:mm')}
                      </p>
                      <p className="text-sm text-white break-words">{c.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add comment + counter */}
            <div className="p-3 border-t border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !sendingComment) addComment(selectedMedia.id);
                  }}
                  placeholder="Ajouter un commentaire…"
                  className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  onClick={() => addComment(selectedMedia.id)}
                  disabled={!commentText.trim() || sendingComment}
                  className="p-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 flex-shrink-0"
                >
                  {sendingComment
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </div>
              <p className="text-[11px] text-gray-600 mt-1.5 text-right">
                {selectedIndex + 1} / {media.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Create album modal ───────────────────────────── */}
      {showCreateAlbum && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateAlbum(false); }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Nouvel album</h3>
              <button
                onClick={() => setShowCreateAlbum(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAlbum()}
              placeholder="Ex : Vacances d'été 2025"
              autoFocus
              maxLength={100}
              className="input-field w-full mb-5"
            />

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setShowCreateAlbum(false)}>
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={createAlbum}
                disabled={!newAlbumName.trim()}
                isLoading={creatingAlbum}
              >
                Créer l'album
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

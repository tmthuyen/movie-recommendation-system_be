'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import useGenre from '@/hooks/tankstack/useGenre';

import { X } from 'lucide-react';

interface PreferenceOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedGenres: string[];
  onSelectGenre: (genreName: string) => void;
  onRemoveGenre: (genreName: string) => void;
  onSave: () => Promise<void>;
  onSkip: () => void;
  isSaving?: boolean;
}

export function PreferenceOnboardingDialog({
  open,
  onOpenChange,
  selectedGenres,
  onSelectGenre,
  onRemoveGenre,
  onSave,
  onSkip,
  isSaving = false,
}: PreferenceOnboardingDialogProps) {
  const { data: genres = [], isLoading: isGenresLoading } = useGenre.useGetAll();
  const [saving, setSaving] = useState(isSaving);

  // Sync saving state with isSaving prop
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaving(isSaving);
  }, [isSaving]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Cá nhân hóa gợi ý phim</DialogTitle>
          <DialogDescription>
            Hãy chọn thể loại phim bạn yêu thích để chúng tôi gợi ý phim phù hợp hơn cho bạn. Bạn có
            thể chọn nhiều thể loại hoặc bỏ qua bước này.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto py-4">
          {/* Selected genres badges */}
          {selectedGenres.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Đã chọn ({selectedGenres.length})</p>
              <div className="flex flex-wrap gap-2">
                {selectedGenres.map((genreName) => (
                  <Badge
                    key={genreName}
                    variant="default"
                    className="flex items-center gap-1 px-3 py-1"
                  >
                    {genreName}
                    <button
                      type="button"
                      onClick={() => onRemoveGenre(genreName)}
                      className="hover:bg-primary-foreground/20 ml-1 rounded-full p-0.5"
                      aria-label={`Xóa ${genreName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Genre list */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Chọn thể loại yêu thích</p>
            {isGenresLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-20 rounded-full" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {genres.map((genre: { id: string; name: string }) => {
                  const isSelected = selectedGenres.includes(genre.name);
                  return (
                    <button
                      key={genre.id}
                      type="button"
                      onClick={() => onSelectGenre(genre.name)}
                      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-accent hover:text-accent-foreground border-border'
                      }`}
                    >
                      {genre.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="ghost" onClick={onSkip} disabled={saving}>
            Bỏ qua
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu và tiếp tục'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

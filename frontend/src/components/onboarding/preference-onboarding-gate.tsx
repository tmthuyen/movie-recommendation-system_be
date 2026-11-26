'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import useUser from '@/hooks/tankstack/useUser';
import { PreferenceOnboardingDialog } from './preference-onboarding-dialog';
import { usePathname } from 'next/navigation';
import type { Genre } from '@/shared/types/api.types';

type PreferenceGenre = Pick<Genre, 'id' | 'name'>;

// Các path được phép hỏi preference.
const ONBOARDING_ASK_PATHS = new Set(['/', '/auth/login', '/auth/signup', '/auth/register']);

/** Kiểm tra preference genre có dạng `{id, name}` hợp lệ. */
function hasValidGenrePreferences(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.some((item) => {
    if (item === null || typeof item !== 'object') return false;
    const candidate = item as { id?: unknown; name?: unknown };
    return typeof candidate.id === 'number' && typeof candidate.name === 'string';
  });
}

export default function PreferenceOnboardingGate() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const updateMeMutation = useUser.useUpdateMe();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<PreferenceGenre[]>([]);
  const [mounted, setMounted] = useState(false);
  // id của user đã được hỏi trong phiên hiện tại.
  const askedUserRef = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) return;

    if (!user) {
      askedUserRef.current = null;
      return;
    }

    if (!ONBOARDING_ASK_PATHS.has(pathname ?? '')) return;

    if (hasValidGenrePreferences(user.preferenceData?.genre)) {
      askedUserRef.current = user.id;
      return;
    }

    if (askedUserRef.current === user.id) return;

    askedUserRef.current = user.id;
    setOpen(true);
  }, [mounted, isLoading, user, pathname]);

  const handleSelectGenre = (genre: PreferenceGenre) => {
    setSelectedGenres((prev) =>
      prev.some((item) => item.id === genre.id)
        ? prev.filter((item) => item.id !== genre.id)
        : [...prev, genre],
    );
  };

  const handleRemoveGenre = (genreId: number) => {
    setSelectedGenres((prev) => prev.filter((item) => item.id !== genreId));
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      await updateMeMutation.mutateAsync({
        preferenceData: { genre: selectedGenres },
      });
      useAuthStore.getState().refreshUser();
      setOpen(false);
    } catch {
      // Error handled by mutation toast
    }
  };

  const handleSkip = () => {
    setOpen(false);
  };

  const shouldShow =
    mounted &&
    !!user &&
    ONBOARDING_ASK_PATHS.has(pathname ?? '') &&
    !hasValidGenrePreferences(user.preferenceData?.genre) &&
    open;

  if (!shouldShow) return null;

  return (
    <PreferenceOnboardingDialog
      open={shouldShow}
      onOpenChange={setOpen}
      selectedGenres={selectedGenres}
      onSelectGenre={handleSelectGenre}
      onRemoveGenre={handleRemoveGenre}
      onSave={handleSave}
      onSkip={handleSkip}
      isSaving={updateMeMutation.isPending}
    />
  );
}

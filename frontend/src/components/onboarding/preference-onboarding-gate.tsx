'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import useUser from '@/hooks/tankstack/useUser';
import { PreferenceOnboardingDialog } from './preference-onboarding-dialog';
import { usePathname } from 'next/navigation';

export default function PreferenceOnboardingGate() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const updateMeMutation = useUser.useUpdateMe();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isLoading) return;
    if (!user) return;
    if (pathname?.startsWith('/auth')) return;

    // Check if user already has preferences
    const hasPreferences =
      user.preferenceData &&
      Array.isArray(user.preferenceData.genre) &&
      user.preferenceData.genre.length > 0;
    if (hasPreferences) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(false);
      return;
    }

    // Check if user skipped onboarding for this user
    const skippedKey = `preference_onboarding_skipped_${user.id}`;
    const skipped = typeof window !== 'undefined' && localStorage.getItem(skippedKey) === 'true';
    if (skipped) {
      setOpen(false);
      return;
    }

    // Show dialog

    setOpen(true);
  }, [mounted, isLoading, user, pathname]);

  const handleSelectGenre = (genreName: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genreName)) {
        return prev.filter((g) => g !== genreName);
      }
      return [...prev, genreName];
    });
  };

  const handleRemoveGenre = (genreName: string) => {
    setSelectedGenres((prev) => prev.filter((g) => g !== genreName));
  };

  const handleSave = async () => {
    if (!user) return;
    if (selectedGenres.length === 0) {
      // Don't save empty, just close? or require selection - but allow save empty is not ideal
      // Save with empty array if user wants to skip? But better require at least 1 or just save
    }
    try {
      await updateMeMutation.mutateAsync({
        preferenceData: { genre: selectedGenres },
      });
      // Refresh user
      useAuthStore.getState().refreshUser();
      setOpen(false);
    } catch {
      // Error handled by mutation toast
    }
  };

  const handleSkip = () => {
    if (user && typeof window !== 'undefined') {
      localStorage.setItem(`preference_onboarding_skipped_${user.id}`, 'true');
    }
    setOpen(false);
  };

  if (!mounted || !user) return null;

  return (
    <PreferenceOnboardingDialog
      open={open}
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

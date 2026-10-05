'use client';

import { useEffect, useState } from 'react';
import { routesPage } from '@/shared/constants/routes';
import { useRouter } from 'next/navigation';
import { EditProfileForm } from './ProfileForm';
import { ProfileDTO } from '@/shared/types/user.types';
import { toast } from 'sonner';

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();


  if (loading) {
    return <div className="text-muted-foreground">Loading profile...</div>;
  }

  return (
    <div className="space-y-6">
      <EditProfileForm profile={profile} />
    </div>
  );
}

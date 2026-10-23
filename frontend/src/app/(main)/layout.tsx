'use client';

import RoleLayout from '@/components/layout/RoleLayout';
import PreferenceOnboardingGate from '@/components/onboarding/preference-onboarding-gate';
import React from 'react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleLayout>
      {children}
      <PreferenceOnboardingGate />
    </RoleLayout>
  );
}

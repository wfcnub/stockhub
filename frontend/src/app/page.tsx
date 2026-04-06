'use client';

import { HeroSection, SyncSection, FeatureBoxes } from '@/components/landing';
import { ControlShell } from '@/components/layout/ControlShell';

export default function Home() {
  return (
    <ControlShell
      activeSection="dashboard"
      title="StockHub Dashboard"
      subtitle="Sync StockHub data and main entry point for features."
    >
      <SyncSection />

      <HeroSection />

      <FeatureBoxes />
    </ControlShell>
  );
}
'use client';

// /board — the projector view. Runs unattended on a TV at the booth: no
// interaction, huge type, and the reveal takeover plays full-screen so the
// room finds out together.

import { useGame } from '@/components/providers/GameProvider';
import { BigScreenBoard } from '@/components/board';
import { RevealQueue } from '@/components/reveal';

export default function BoardPage() {
  const { markets, reveals, dismissReveal } = useGame();

  return (
    <div className="min-h-dvh bg-ink">
      <BigScreenBoard markets={markets} />
      <RevealQueue pending={reveals} onDone={dismissReveal} />
    </div>
  );
}

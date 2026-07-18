'use client';

import type { Player } from '@/lib/types';
import { bonusLabel } from '@/components/referral';

// ---------------------------------------------------------------------------
// A pointer, not a surface. The header's INVITE button and its modal are the
// canonical referral flow now; this exists so someone already staring at their
// balance in the portfolio gets nudged toward it without a second QR dialog to
// maintain.
// ---------------------------------------------------------------------------

export interface ReferralCardProps {
  player: Player;
  /** Opens the invite modal. Owned by the page, which also closes this panel. */
  onInvite?: () => void;
  className?: string;
}

export function ReferralCard({ player, onInvite, className = '' }: ReferralCardProps) {
  const bonus = bonusLabel();

  return (
    <section className={`referral-box ${className}`} aria-labelledby="referral-title">
      <div>
        <span id="referral-title">REFERRAL CREDIT · {bonus} EACH</span>
        <strong>Invite someone with code {player.ref_code}</strong>
      </div>

      <button type="button" className="invite-primary" onClick={onInvite}>
        INVITE · {bonus}
      </button>
    </section>
  );
}

export default ReferralCard;

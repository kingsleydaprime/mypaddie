"use client";

import { useEffect, useState } from "react";

/**
 * iPhone and iPad only deliver web notifications to an app added to the Home
 * Screen. Say so there; elsewhere show nothing.
 */
export function InstallHint() {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the device once, after mount
    setNeeded(ios && !installed);
  }, []);
  if (!needed) return null;
  return (
    <div className="rounded-2xl border border-gold bg-surface p-4 text-sm">
      <p className="font-semibold">On iPhone, add MyPaddie to your Home Screen first</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
        <li>Tap the Share button <span aria-hidden>(□↑)</span> in Safari.</li>
        <li>Choose <strong>Add to Home Screen</strong>, then Add.</li>
        <li>Open MyPaddie from the new icon and come back here — reminders can be turned on from there.</li>
      </ol>
    </div>
  );
}

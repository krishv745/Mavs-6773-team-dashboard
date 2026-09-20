"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Fires regardless of tab visibility or user activity — a background tab
 * still runs its JS timers (browsers throttle them, they don't stop them),
 * so as long as this keeps pinging, the tab is genuinely still open.
 * Closing it is what actually stops these calls.
 */
export default function ClockHeartbeat() {
  useEffect(() => {
    const ping = () => {
      fetch("/api/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}

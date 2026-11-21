import { useEffect, useState } from "react";
import {
  getConnectionState,
  subscribeConnectionState,
  type ConnectionState,
} from "../api/client";

export function ColdStartBanner() {
  const [state, setState] = useState<ConnectionState>(() => getConnectionState());

  useEffect(() => {
    return subscribeConnectionState(setState);
  }, []);

  if (state.status === "idle" || !state.message) {
    return null;
  }

  if (state.status === "waking") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-500/40 bg-amber-950/80 px-4 py-2 text-center text-xs font-medium text-amber-200"
      >
        {state.message}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-rose-500/40 bg-rose-950/90 px-4 py-2 text-center text-xs font-medium text-rose-200"
    >
      {state.message}
    </div>
  );
}

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
        className="border-b border-warning/35 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning-text"
      >
        {state.message}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="border-b border-danger/35 bg-danger-soft px-4 py-2 text-center text-xs font-medium text-danger-text"
    >
      {state.message}
    </div>
  );
}

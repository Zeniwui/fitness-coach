import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export const PENDING_INVITE_STORAGE_KEY = "fitness_coach_pending_invite";

export function usePendingInviteCode(): {
  pendingInviteCode: string | null;
  clearPendingInviteCode: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteFromUrl = searchParams.get("invite")?.trim() || null;

  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    if (inviteFromUrl) {
      window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, inviteFromUrl);
      return inviteFromUrl;
    }
    return window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  });

  useEffect(() => {
    if (inviteFromUrl) {
      window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, inviteFromUrl);
      setPendingInviteCode(inviteFromUrl);
    }
  }, [inviteFromUrl]);

  const clearPendingInviteCode = useCallback(() => {
    window.sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    setPendingInviteCode(null);
    if (searchParams.has("invite")) {
      const next = new URLSearchParams(searchParams);
      next.delete("invite");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return { pendingInviteCode, clearPendingInviteCode };
}

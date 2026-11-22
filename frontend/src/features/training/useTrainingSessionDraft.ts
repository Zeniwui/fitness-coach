import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiClient } from "../../api/client";
import {
  evaluateSessionAchievements,
  type SessionAchievementSummary,
} from "./progression";
import {
  buildGroupsFromSession,
  buildGroupsFromTodaySession,
  clearPersistedSessionDraft,
  createDefaultExerciseGroup,
  hasSessionDraftContent,
  readPersistedSessionDraft,
  validateAndFlattenGroups,
  writePersistedSessionDraft,
} from "./sessionDraft";
import type {
  EditableExerciseGroup,
  TodaySessionResponse,
  TrainingSessionResponse,
} from "./types";

export interface SessionDraftState {
  editingSessionId: string | null;
  sessionName: string;
  sessionDate: string;
  fatigueNotes: string;
  exerciseGroups: EditableExerciseGroup[];
  startedFromToday: boolean;
  achievementSummary: SessionAchievementSummary | null;
}

export interface SessionDraftActions {
  setSessionName: (value: string) => void;
  setSessionDate: (value: string) => void;
  setFatigueNotes: (value: string) => void;
  setExerciseGroups: (groups: EditableExerciseGroup[]) => void;
  dismissAchievement: () => void;
  discardDraft: () => void;
  cancelEdit: () => void;
  saveSession: (e: FormEvent) => Promise<void>;
  editSession: (session: TrainingSessionResponse) => void;
  deleteSession: (sessionId: string) => Promise<void>;
  handleNaturalSessionSaved: (saved: TrainingSessionResponse) => Promise<void>;
}

interface UseTrainingSessionDraftOptions {
  athleteKey: string | null;
  activeMesocycleId: string | null;
  sessions: TrainingSessionResponse[];
  loadAll: () => Promise<void>;
  setErrorMsg: (msg: string | null) => void;
  setFeedbackMsg: (msg: string | null) => void;
  onOpenSessionsTab: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useTrainingSessionDraft({
  athleteKey,
  activeMesocycleId,
  sessions,
  loadAll,
  setErrorMsg,
  setFeedbackMsg,
  onOpenSessionsTab,
}: UseTrainingSessionDraftOptions) {
  const [initialDraft] = useState(() => readPersistedSessionDraft(athleteKey));
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(() => initialDraft?.sessionDate ?? todayIso());
  const [sessionName, setSessionName] = useState(
    () => initialDraft?.sessionName ?? "Sesión de Entrenamiento",
  );
  const [sessionPlannedId, setSessionPlannedId] = useState<string | null>(
    () => initialDraft?.sessionPlannedId ?? null,
  );
  const [fatigueNotes, setFatigueNotes] = useState(() => initialDraft?.fatigueNotes ?? "");
  const [exerciseGroups, setExerciseGroups] = useState<EditableExerciseGroup[]>(
    () => initialDraft?.exerciseGroups ?? [createDefaultExerciseGroup()],
  );
  const [startedFromToday, setStartedFromToday] = useState(
    () => initialDraft?.startedFromToday ?? false,
  );
  const [achievementSummary, setAchievementSummary] =
    useState<SessionAchievementSummary | null>(null);

  const lastAthleteKeyRef = useRef(athleteKey);

  useEffect(() => {
    if (lastAthleteKeyRef.current === athleteKey) return;
    lastAthleteKeyRef.current = athleteKey;

    const restored = readPersistedSessionDraft(athleteKey);
    setEditingSessionId(null);
    setAchievementSummary(null);
    setSessionDate(restored?.sessionDate ?? todayIso());
    setSessionName(restored?.sessionName ?? "Sesión de Entrenamiento");
    setSessionPlannedId(restored?.sessionPlannedId ?? null);
    setFatigueNotes(restored?.fatigueNotes ?? "");
    setStartedFromToday(restored?.startedFromToday ?? false);
    setExerciseGroups(restored?.exerciseGroups ?? [createDefaultExerciseGroup()]);
  }, [athleteKey]);

  useEffect(() => {
    if (editingSessionId || !athleteKey) return;
    if (!hasSessionDraftContent(exerciseGroups, fatigueNotes)) {
      clearPersistedSessionDraft(athleteKey);
      return;
    }
    const timer = window.setTimeout(() => {
      writePersistedSessionDraft(
        {
          version: 2,
          sessionDate,
          sessionName,
          sessionPlannedId,
          fatigueNotes,
          exerciseGroups,
          startedFromToday,
        },
        athleteKey,
      );
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    athleteKey,
    editingSessionId,
    sessionDate,
    sessionName,
    sessionPlannedId,
    fatigueNotes,
    exerciseGroups,
    startedFromToday,
  ]);

  function resetBlankSessionDraft() {
    setEditingSessionId(null);
    setSessionDate(todayIso());
    setSessionName("Sesión de Entrenamiento");
    setSessionPlannedId(null);
    setFatigueNotes("");
    setStartedFromToday(false);
    setExerciseGroups([createDefaultExerciseGroup()]);
    clearPersistedSessionDraft(athleteKey);
  }

  function startLoggingTodaySession(todayData: TodaySessionResponse | null) {
    if (!todayData?.planned_session) return;
    setEditingSessionId(null);
    setAchievementSummary(null);
    setErrorMsg(null);
    setSessionDate(todayIso());
    setSessionName(todayData.planned_session.name);
    setSessionPlannedId(todayData.planned_session.id);
    setFatigueNotes("");
    setStartedFromToday(true);
    setExerciseGroups(buildGroupsFromTodaySession(todayData));
    onOpenSessionsTab();
  }

  function editSession(session: TrainingSessionResponse) {
    setEditingSessionId(session.id);
    setAchievementSummary(null);
    setErrorMsg(null);
    setSessionDate(session.session_date);
    setSessionName(session.name);
    setSessionPlannedId(session.planned_session_id ?? null);
    setFatigueNotes(session.fatigue_notes ?? "");
    setStartedFromToday(false);
    setExerciseGroups(buildGroupsFromSession(session));
    onOpenSessionsTab();
  }

  async function saveSession(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);

    const { sets: parsedSets, error: validationError } =
      validateAndFlattenGroups(exerciseGroups);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const resolvedName = sessionName.trim() || "Sesión de Entrenamiento";
    const priorSessionsSnapshot = sessions;
    const editedId = editingSessionId;

    if (editedId) {
      const res = await apiClient.PUT("/api/v1/training/sessions/{session_id}", {
        params: { path: { session_id: editedId } },
        body: {
          session_date: sessionDate,
          name: resolvedName,
          planned_session_id: sessionPlannedId,
          fatigue_notes: fatigueNotes.trim() || null,
          sets: parsedSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo actualizar la Sesión de Entrenamiento.");
        return;
      }
      setFeedbackMsg(
        `Sesión de Entrenamiento actualizada (${parsedSets.length} series registradas).`,
      );
    } else {
      const res = await apiClient.POST("/api/v1/training/sessions", {
        body: {
          session_date: sessionDate,
          name: resolvedName,
          mesocycle_id: activeMesocycleId,
          planned_session_id: sessionPlannedId,
          origin: "manual_form",
          fatigue_notes: fatigueNotes.trim() || null,
          sets: parsedSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo guardar la Sesión de Entrenamiento.");
        return;
      }
      setFeedbackMsg(
        `Sesión de Entrenamiento registrada (${parsedSets.length} series guardadas en tu historial).`,
      );
    }

    const summary = evaluateSessionAchievements(
      parsedSets,
      priorSessionsSnapshot,
      resolvedName,
      editedId,
    );
    setAchievementSummary(summary);
    resetBlankSessionDraft();
    await loadAll();
  }

  async function deleteSession(sessionId: string) {
    setErrorMsg(null);
    const res = await apiClient.DELETE("/api/v1/training/sessions/{session_id}", {
      params: { path: { session_id: sessionId } },
    });
    if (res.error) {
      setErrorMsg("No se pudo eliminar la Sesión de Entrenamiento.");
      return;
    }
    setAchievementSummary(null);
    setFeedbackMsg("Sesión de Entrenamiento eliminada.");
    await loadAll();
  }

  async function handleNaturalSessionSaved(saved: TrainingSessionResponse) {
    const summary = evaluateSessionAchievements(
      saved.sets,
      sessions,
      saved.name,
      saved.id,
    );
    setAchievementSummary(summary);
    setFeedbackMsg("Sesión de Entrenamiento confirmada y guardada en tu historial.");
    await loadAll();
  }

  function discardDraft() {
    resetBlankSessionDraft();
    setErrorMsg(null);
    setFeedbackMsg("Borrador local descartado.");
  }

  const draftState: SessionDraftState = {
    editingSessionId,
    sessionName,
    sessionDate,
    fatigueNotes,
    exerciseGroups,
    startedFromToday,
    achievementSummary,
  };

  const draftActions: SessionDraftActions = {
    setSessionName,
    setSessionDate,
    setFatigueNotes,
    setExerciseGroups,
    dismissAchievement: () => setAchievementSummary(null),
    discardDraft,
    cancelEdit: resetBlankSessionDraft,
    saveSession,
    editSession,
    deleteSession,
    handleNaturalSessionSaved,
  };

  return {
    draftState,
    draftActions,
    startLoggingTodaySession,
  };
}

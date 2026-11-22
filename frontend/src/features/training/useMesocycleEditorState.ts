import { useState, type FormEvent } from "react";
import { apiClient } from "../../api/client";
import {
  mesocycleToEditablePlannedSessions,
  validateAndSanitizePlannedSessions,
} from "./mesocycleValidation";
import type {
  ConflictModalState,
  EditablePlannedSession,
  MesocycleResponse,
} from "./types";

export interface MesocycleEditorState {
  coachFocus: string;
  draftingWithCoach: boolean;
  editingMesoId: string | null;
  editMesoName: string;
  editMesoGoal: string;
  editMesoWeeks: string;
  editMesoSessions: EditablePlannedSession[];
}

export interface MesocycleEditorActions {
  setCoachFocus: (value: string) => void;
  draftWithCoach: () => Promise<void>;
  startEdit: (meso: MesocycleResponse) => void;
  cancelEdit: () => void;
  setEditName: (value: string) => void;
  setEditGoal: (value: string) => void;
  setEditWeeks: (value: string) => void;
  setEditSessions: (sessions: EditablePlannedSession[]) => void;
  saveEdit: (e: FormEvent) => Promise<void>;
  activate: (meso: MesocycleResponse, confirmTransition?: "completed" | "archived") => Promise<void>;
  transitionStatus: (mesoId: string, status: "deload" | "completed" | "archived") => Promise<void>;
}

interface UseMesocycleEditorStateOptions {
  loadAll: () => Promise<void>;
  setErrorMsg: (msg: string | null) => void;
  setFeedbackMsg: (msg: string | null) => void;
}

export function useMesocycleEditorState({
  loadAll,
  setErrorMsg,
  setFeedbackMsg,
}: UseMesocycleEditorStateOptions) {
  const [coachFocus, setCoachFocus] = useState("");
  const [draftingWithCoach, setDraftingWithCoach] = useState(false);

  const [editingMesoId, setEditingMesoId] = useState<string | null>(null);
  const [editMesoName, setEditMesoName] = useState("");
  const [editMesoGoal, setEditMesoGoal] = useState("");
  const [editMesoWeeks, setEditMesoWeeks] = useState("5");
  const [editMesoSessions, setEditMesoSessions] = useState<EditablePlannedSession[]>([]);

  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  async function draftWithCoach() {
    setDraftingWithCoach(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiClient.POST("/api/v1/training/mesocycles/draft-with-coach", {
        body: { focus_notes: coachFocus.trim() || null },
      });
      if (res.error || !res.data) {
        setErrorMsg("No se pudo generar el borrador de Mesociclo con el Coach.");
        return;
      }
      setCoachFocus("");
      setFeedbackMsg(res.data.coach_rationale_es || "Borrador de Mesociclo generado.");
      await loadAll();
    } finally {
      setDraftingWithCoach(false);
    }
  }

  function startEdit(meso: MesocycleResponse) {
    setEditingMesoId(meso.id);
    setEditMesoName(meso.name);
    setEditMesoGoal(meso.goal);
    setEditMesoWeeks(String(meso.duration_weeks));
    setEditMesoSessions(mesocycleToEditablePlannedSessions(meso));
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingMesoId) return;
    setErrorMsg(null);

    const { sessions: sanitizedSessions, error: validationError } =
      validateAndSanitizePlannedSessions(editMesoSessions);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const res = await apiClient.PATCH("/api/v1/training/mesocycles/{mesocycle_id}", {
      params: { path: { mesocycle_id: editingMesoId } },
      body: {
        name: editMesoName.trim(),
        goal: editMesoGoal.trim(),
        duration_weeks: Number(editMesoWeeks) || 5,
        planned_sessions: sanitizedSessions,
      },
    });
    if (res.error) {
      setErrorMsg("No se pudieron guardar los cambios del Mesociclo.");
      return;
    }
    setEditingMesoId(null);
    setFeedbackMsg("Mesociclo actualizado correctamente.");
    await loadAll();
  }

  async function activate(
    meso: MesocycleResponse,
    confirmTransition?: "completed" | "archived",
  ) {
    setErrorMsg(null);
    setFeedbackMsg(null);
    const res = await apiClient.POST("/api/v1/training/mesocycles/{mesocycle_id}/activate", {
      params: { path: { mesocycle_id: meso.id } },
      body: confirmTransition ? { confirm_transition_status: confirmTransition } : {},
    });

    if (res.response.status === 409) {
      const detail = (res.error as { detail?: Record<string, string> } | undefined)?.detail;
      setConflictModal({
        targetMesocycleId: meso.id,
        targetMesocycleName: meso.name,
        activeMesocycleName: detail?.active_mesocycle_name || "Mesociclo actual",
      });
      return;
    }

    if (res.error) {
      setErrorMsg("No se pudo activar el Mesociclo.");
      return;
    }

    setConflictModal(null);
    setFeedbackMsg("Mesociclo activado correctamente.");
    await loadAll();
  }

  async function transitionStatus(
    mesoId: string,
    status: "deload" | "completed" | "archived",
  ) {
    setErrorMsg(null);
    const res = await apiClient.POST("/api/v1/training/mesocycles/{mesocycle_id}/status", {
      params: { path: { mesocycle_id: mesoId } },
      body: { status },
    });
    if (res.error) {
      setErrorMsg("No se pudo cambiar el estado del Mesociclo.");
      return;
    }
    setFeedbackMsg("Estado del Mesociclo actualizado.");
    await loadAll();
  }

  const editorState: MesocycleEditorState = {
    coachFocus,
    draftingWithCoach,
    editingMesoId,
    editMesoName,
    editMesoGoal,
    editMesoWeeks,
    editMesoSessions,
  };

  const editorActions: MesocycleEditorActions = {
    setCoachFocus,
    draftWithCoach,
    startEdit,
    cancelEdit: () => setEditingMesoId(null),
    setEditName: setEditMesoName,
    setEditGoal: setEditMesoGoal,
    setEditWeeks: setEditMesoWeeks,
    setEditSessions: setEditMesoSessions,
    saveEdit,
    activate,
    transitionStatus,
  };

  return {
    editorState,
    editorActions,
    conflictModal,
    dismissConflictModal: () => setConflictModal(null),
  };
}

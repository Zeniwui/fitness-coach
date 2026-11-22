import type { components } from "../../api/generated/schema";
import type { BadgeTone } from "../../ui/Badge";

export type EvidenceLevel = components["schemas"]["EvidenceLevel"];
export type ValidityStatus = components["schemas"]["ValidityStatus"];
export type RelationType = components["schemas"]["RelationType"];

export const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  meta_analysis: "Meta-análisis",
  systematic_review: "Revisión sistemática",
  position_stand: "Posicionamiento (ISSN/Consenso)",
  rct: "Ensayo clínico (RCT)",
  controlled_trial: "Ensayo controlado",
  observational: "Observacional",
  mechanistic: "Mecanístico",
  preprint: "Preprint",
};

export const VALIDITY_LABELS: Record<string, string> = {
  active: "Vigente",
  nuanced: "Matizada",
  superseded: "Superada",
  archived: "Archivada",
};

export const VALIDITY_TONES: Record<ValidityStatus, BadgeTone> = {
  active: "success",
  nuanced: "warning",
  superseded: "danger",
  archived: "neutral",
};

export const RELATION_LABELS: Record<RelationType, string> = {
  confirms: "Confirma",
  nuances: "Matiza",
  supersedes: "Supera",
};

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  redeemed: "Canjeada",
  accepted: "Aceptada",
  expired: "Caducada",
  revoked: "Revocada",
};

export const MONTHLY_CUT_RUN_TYPE_LABELS: Record<string, string> = {
  seed: "Lote Semilla",
  manual: "Manual",
  scheduled: "Programado",
};

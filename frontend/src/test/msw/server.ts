import { setupServer } from "msw/node";
import { coachHandlers } from "./handlers/coach";
import { identityHandlers } from "./handlers/identity";
import { knowledgeHandlers } from "./handlers/knowledge";
import { monthlyCutHandlers } from "./handlers/monthlyCut";
import { profileHandlers } from "./handlers/profile";
import { trainingHandlers } from "./handlers/training";

export const server = setupServer(
  ...identityHandlers,
  ...profileHandlers,
  ...knowledgeHandlers,
  ...monthlyCutHandlers,
  ...coachHandlers,
  ...trainingHandlers,
);

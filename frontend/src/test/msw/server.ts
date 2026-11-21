import { setupServer } from "msw/node";
import { coachHandlers } from "./handlers/coach";
import { identityHandlers } from "./handlers/identity";
import { knowledgeHandlers } from "./handlers/knowledge";
import { monthlyCutHandlers } from "./handlers/monthlyCut";
import { multimodalHandlers } from "./handlers/multimodal";
import { nutritionHandlers } from "./handlers/nutrition";
import { profileHandlers } from "./handlers/profile";
import { trainingHandlers } from "./handlers/training";

export const server = setupServer(
  ...identityHandlers,
  ...profileHandlers,
  ...knowledgeHandlers,
  ...monthlyCutHandlers,
  ...multimodalHandlers,
  ...coachHandlers,
  ...trainingHandlers,
  ...nutritionHandlers,
);

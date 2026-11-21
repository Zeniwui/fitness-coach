import { setupServer } from "msw/node";
import { identityHandlers } from "./handlers/identity";
import { knowledgeHandlers } from "./handlers/knowledge";
import { monthlyCutHandlers } from "./handlers/monthlyCut";
import { profileHandlers } from "./handlers/profile";

export const server = setupServer(
  ...identityHandlers,
  ...profileHandlers,
  ...knowledgeHandlers,
  ...monthlyCutHandlers,
);

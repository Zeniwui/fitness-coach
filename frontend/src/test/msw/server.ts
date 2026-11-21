import { setupServer } from "msw/node";
import { identityHandlers } from "./handlers/identity";
import { knowledgeHandlers } from "./handlers/knowledge";
import { profileHandlers } from "./handlers/profile";

export const server = setupServer(...identityHandlers, ...profileHandlers, ...knowledgeHandlers);

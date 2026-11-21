import { setupServer } from "msw/node";
import { identityHandlers } from "./handlers/identity";
import { profileHandlers } from "./handlers/profile";

export const server = setupServer(...identityHandlers, ...profileHandlers);

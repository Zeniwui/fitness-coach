import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthContext";
import { ColdStartBanner } from "./ColdStartBanner";
import { AppRoutes } from "./routes";

export interface AppProps {
  initialEntries?: string[];
}

export function App({ initialEntries }: AppProps) {
  const content = (
    <AuthProvider>
      <ColdStartBanner />
      <AppRoutes />
    </AuthProvider>
  );

  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>;
  }
  return <BrowserRouter>{content}</BrowserRouter>;
}

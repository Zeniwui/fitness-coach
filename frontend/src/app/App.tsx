import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../features/auth/AuthContext";
import { ThemeProvider } from "../theme/ThemeContext";
import { ColdStartBanner } from "./ColdStartBanner";
import { AppRoutes } from "./routes";

export interface AppProps {
  initialEntries?: string[];
}

export function App({ initialEntries }: AppProps) {
  const content = (
    <ThemeProvider>
      <AuthProvider>
        <ColdStartBanner />
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );

  if (initialEntries) {
    return <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>;
  }
  return <BrowserRouter>{content}</BrowserRouter>;
}

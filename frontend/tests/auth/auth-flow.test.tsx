import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, beforeEach, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  useTRPCClient: () => ({ auth: {
    login: { mutate: mocks.login },
    me: { query: mocks.me },
    logout: { mutate: mocks.logout },
  }}),
  createUlmsTrpcClient: () => ({ auth: {
    login: { mutate: mocks.login },
    me: { query: mocks.me },
    logout: { mutate: mocks.logout },
  }}),
  TRPCProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: () => <div data-testid="app-shell">App Shell</div>,
}));
vi.mock("@/app/router", () => ({
  AppRouter: () => <div data-testid="shell-content">shell</div>,
}));
vi.mock("@/components/layout/use-nav-counts", () => ({ useNavCounts: () => ({}) }));
vi.mock("@/components/layout/ku-logo", () => ({ KULogo: () => <div /> }));
vi.mock("@/components/shared/language-toggle", () => ({ LanguageToggle: () => <div /> }));
vi.mock("@/features/auth/signin-help", () => ({ SignInHelp: () => <div /> }));
vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ isDark: false, toggleTheme: vi.fn() }) }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "th" } }),
}));

vi.mock("@/features/auth/login-method-ku", () => ({
  LoginMethodKu: ({ open, onToggle, onSubmit }: any) => (
    <>
      <button onClick={onToggle}>KU method</button>
      {open && <button onClick={() => onSubmit({ email: "student@ku.ac.th", password: "secret" })}>KU submit</button>}
    </>
  ),
}));
vi.mock("@/features/auth/login-method-local", () => ({
  LoginMethodLocal: ({ open, onToggle, onSubmit }: any) => (
    <>
      <button onClick={onToggle}>Local method</button>
      {open && <button onClick={() => onSubmit({ username: "staff01", password: "secret" })}>Local submit</button>}
    </>
  ),
}));

import { LoginPage } from "@/features/auth/login-page";
import { useAuthStore } from "@/features/auth/auth.store";
import { App } from "@/app/app";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { Sidebar } from "@/components/layout/sidebar";

describe("Authentication flow — Module 1.4", () => {
  const borrower = {
    id: "1", studentId: "6410501234", firstName: "Test", lastName: "Student", name: "Test Student",
    email: "student@ku.ac.th", role: "borrower" as const, facultyName: "CPE",
    creditScore: 80, creditTier: "T1" as const, maxBorrowDays: 7, maxExtendTimes: 1,
  };
  const staff = { ...borrower, role: "staff" as const };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: false });
  });

  it("1.4.1 KU login → tRPC → cookie/session response → redirect", async () => {
    mocks.login.mockResolvedValue({ user: borrower });
    render(<MemoryRouter initialEntries={["/login"]}><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "KU submit" }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ username: "student@ku.ac.th", password: "secret" }));
    await waitFor(() => expect(useAuthStore.getState().user?.id).toBe("1"));
  });

  it("1.4.2 local login → tRPC → cookie/session response → redirect", async () => {
    mocks.login.mockResolvedValue({ user: staff });
    render(<MemoryRouter initialEntries={["/login"]}><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Local method" }));
    fireEvent.click(screen.getByRole("button", { name: "Local submit" }));
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({
      username: "staff01",
      password: "secret",
    }));
    await waitFor(() => expect(useAuthStore.getState().user?.role).toBe("staff"));
  });

  it("1.4.3 invalid credentials map to the unified Thai auth error path", async () => {
    mocks.login.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
    render(<MemoryRouter initialEntries={["/login"]}><LoginPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "KU submit" }));
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });

  it("1.4.4 app mount calls auth.me and hydrates Zustand for the shell", async () => {
    mocks.me.mockResolvedValue(borrower);
    render(<App />);
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe("Test Student"));
  });

  it("1.4.5 auth.me failure clears the store for a signed-out session", async () => {
    useAuthStore.setState({ user: { id: "1" } as any, isLoading: false });
    mocks.me.mockRejectedValue(new Error("NOT_AUTHENTICATED"));
    render(<App />);
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });

  it("1.4.6 logout calls auth.logout, clears store, and leaves authenticated state", async () => {
    useAuthStore.setState({ user: borrower as any, isLoading: false });
    render(<MemoryRouter initialEntries={["/home"]}><Sidebar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "common.signOut" }));
    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
  });

  it("1.4.7 unauthenticated user is redirected to /login", async () => {
    render(
      <MemoryRouter initialEntries={["/catalog"]}>
        <Routes>
          <Route path="/catalog" element={<ProtectedRoute><div>protected</div></ProtectedRoute>} />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("1.4.8 insufficient role is redirected away from role-protected content", () => {
    useAuthStore.setState({ user: borrower as any, isLoading: false });
    render(<MemoryRouter initialEntries={["/admin"]}><ProtectedRoute allowedRoles={["admin"]}><div>admin</div></ProtectedRoute></MemoryRouter>);
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });
});

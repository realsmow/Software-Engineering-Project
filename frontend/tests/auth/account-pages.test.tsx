import { StrictMode, type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { okOutput } from "../../../backend/src/common/schemas/ok.schema";
import { changePasswordOutput } from "../../../backend/src/auth/auth.schema";
import RegisterPage from "../../src/features/auth/register-page";
import VerifyEmailPage from "../../src/features/auth/verify-email-page";
import ForgotPasswordPage from "../../src/features/auth/forgot-password-page";
import ResetPasswordPage from "../../src/features/auth/reset-password-page";
import ProfilePage from "../../src/features/account/profile-page";
import { useAuthStore } from "../../src/features/auth/auth.store";
import { toClientUser } from "../../src/features/auth/user.adapter";
import i18n from "../../src/i18n";
import { getErrorMessage } from "../../src/lib/error-messages";
import { creditResponse, userResponse } from "../fixtures/api-responses";

const api = vi.hoisted(() => vi.fn<(path: string, input?: unknown) => unknown>());
vi.mock("../../src/lib/trpc", () => {
  const client = new Proxy(
    {},
    {
      get: (_, domain: string) =>
        new Proxy(
          {},
          {
            get: (_, procedure: string) => {
              const call = (input?: unknown) =>
                Promise.resolve().then(() => api(`${domain}.${procedure}`, input));
              return { query: call, mutate: call };
            },
          }
        ),
    }
  );
  return { useTRPCClient: () => client };
});
const clients: QueryClient[] = [];
function mount(element: ReactElement, url = "/test") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/test" element={element} />
          <Route path="/login" element={<h1>Sign-in destination</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(i18n.t(label)), { target: { value } });
}
beforeEach(() => {
  void i18n.changeLanguage("en");
  vi.clearAllMocks();
  useAuthStore.getState().setUser(toClientUser(userResponse()));
  api.mockImplementation((path) => {
    if (path === "credit.me") return creditResponse({ maxBorrowDays: 9 });
    if (path === "auth.changePassword")
      return changePasswordOutput.parse({ ok: true, otherSessionsRevoked: 2 });
    if (
      [
        "auth.register",
        "auth.verifyEmail",
        "auth.requestPasswordReset",
        "auth.resetPasswordWithToken",
        "auth.logoutAll",
      ].includes(path)
    )
      return okOutput.parse({ ok: true });
    throw new Error(`Unexpected account-page procedure: ${path}`);
  });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setUser(null);
  vi.restoreAllMocks();
});

describe("registration and token pages", () => {
  it("validates password confirmation and sends a trimmed registration without a role", async () => {
    mount(<RegisterPage />);
    const submit = screen.getByRole("button", {
      name: i18n.t("auth.registerSubmit"),
    });
    expect(submit).toBeDisabled();
    change("auth.email", "ada@ku.th");
    change("auth.studentId", " S12345 ");
    change("auth.firstName", " Ada ");
    change("auth.lastName", " Lovelace ");
    change("auth.password", "password123");
    change("auth.confirmPassword", "different123");
    expect(submit).toBeDisabled();
    change("auth.confirmPassword", "password123");
    fireEvent.click(submit);
    await screen.findByRole("status");
    expect(api).toHaveBeenCalledWith("auth.register", {
      email: "ada@ku.th",
      studentId: "S12345",
      firstName: "Ada",
      lastName: "Lovelace",
      password: "password123",
    });
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("auth.registerSent"));
  });

  it("spends an email token once even under StrictMode's repeated effect", async () => {
    mount(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
      "/test?token=verification-token"
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      i18n.t("auth.verifyDone")
    );
    expect(api.mock.calls).toEqual([
      ["auth.verifyEmail", { token: "verification-token" }],
    ]);
  });

  it("does not submit a missing email token and displays an expired token refusal", async () => {
    const first = mount(<VerifyEmailPage />);
    expect(screen.getByText(i18n.t("auth.verifyNoToken"))).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    first.unmount();
    api.mockRejectedValue(new Error("TOKEN_EXPIRED"));
    mount(<VerifyEmailPage />, "/test?token=expired-token");
    await screen.findByText(i18n.t("auth.verifyFailed"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["registered@ku.th", "unknown@ku.th"])(
    "shows the same reset-request confirmation for %s",
    async (email) => {
      mount(<ForgotPasswordPage />);
      change("auth.email", email);
      fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.forgotSubmit") }));
      expect(await screen.findByRole("status")).toHaveTextContent(
        i18n.t("auth.forgotSent")
      );
      expect(api).toHaveBeenCalledWith("auth.requestPasswordReset", { email });
    }
  );

  it("blocks reset without a token and rejects mismatched passwords before calling the API", async () => {
    const first = mount(<ResetPasswordPage />);
    expect(screen.getByText(i18n.t("auth.resetNoToken"))).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: i18n.t("auth.resetSubmit") })
    ).not.toBeInTheDocument();
    first.unmount();
    mount(<ResetPasswordPage />, "/test?token=reset-token");
    change("profile.newPassword", "password123");
    change("profile.confirmPassword", "different123");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.resetSubmit") }));
    expect(screen.getByText(i18n.t("profile.passwordMismatch"))).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it("sends the reset token and new password then returns to sign-in", async () => {
    mount(<ResetPasswordPage />, "/test?token=reset-token");
    change("profile.newPassword", "password123");
    change("profile.confirmPassword", "password123");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auth.resetSubmit") }));
    await screen.findByRole("heading", { name: "Sign-in destination" });
    expect(api).toHaveBeenCalledWith("auth.resetPasswordWithToken", {
      token: "reset-token",
      newPassword: "password123",
    });
  });
});

describe("profile account actions through real hooks", () => {
  it("shows the server borrowing allowance and changes a password with the current password", async () => {
    mount(<ProfilePage />);
    await screen.findByText(i18n.t("borrower.detail.days", { count: 9 }));
    change("profile.currentPassword", "old-password");
    change("profile.newPassword", "new-password");
    change("profile.confirmPassword", "new-password");
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.changePassword") })
    );
    await screen.findByText(i18n.t("profile.passwordChangedOthers", { count: 2 }));
    expect(api).toHaveBeenCalledWith("auth.changePassword", {
      currentPassword: "old-password",
      newPassword: "new-password",
    });
    expect(screen.getByLabelText(i18n.t("profile.currentPassword"))).toHaveValue("");
  });

  it("does not revoke sessions when confirmation is declined, then clears auth after a confirmed logout", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(<ProfilePage />);
    const button = screen.getByRole("button", {
      name: i18n.t("profile.signOutEverywhere"),
    });
    fireEvent.click(button);
    expect(api.mock.calls.some(([path]) => path === "auth.logoutAll")).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await screen.findByRole("heading", { name: "Sign-in destination" });
    expect(api).toHaveBeenCalledWith("auth.logoutAll", undefined);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("keeps the session and form when the current password is rejected", async () => {
    const original = api.getMockImplementation()!;
    api.mockImplementation((path, input) => {
      if (path === "auth.changePassword") throw new Error("INVALID_CREDENTIALS");
      return original(path, input);
    });
    mount(<ProfilePage />);
    change("profile.currentPassword", "wrong-password");
    change("profile.newPassword", "new-password");
    change("profile.confirmPassword", "new-password");
    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("profile.changePassword") })
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("auth.changePassword", {
        currentPassword: "wrong-password",
        newPassword: "new-password",
      })
    );
    await screen.findByText(getErrorMessage(new Error("INVALID_CREDENTIALS")));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: i18n.t("profile.changePassword") })
      ).toBeEnabled()
    );
    expect(useAuthStore.getState().user).not.toBeNull();
    expect(screen.getByLabelText(i18n.t("profile.currentPassword"))).toHaveValue(
      "wrong-password"
    );
  });
});

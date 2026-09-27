import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { kuLoginSchema, localLoginSchema } from "@/features/auth/login.schema";
import { LoginMethodKu } from "@/features/auth/login-method-ku";
import { LoginMethodLocal } from "@/features/auth/login-method-local";

describe("Authentication form validation — Module 1.3", () => {
  describe("1.3.1 KU email validation", () => {
    it("accepts @ku.ac.th and @ku.th addresses", () => {
      expect(
        kuLoginSchema.safeParse({ email: "student@ku.ac.th", password: "secret" }).success
      ).toBe(true);
      expect(
        kuLoginSchema.safeParse({ email: "student@ku.th", password: "secret" }).success
      ).toBe(true);
    });

    it("rejects non-KU email domains", () => {
      expect(
        kuLoginSchema.safeParse({ email: "student@gmail.com", password: "secret" })
          .success
      ).toBe(false);
    });
  });

  describe("1.3.2 empty KU email/password validation", () => {
    it("rejects empty email and password with Thai validation messages", () => {
      const result = kuLoginSchema.safeParse({ email: "", password: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual(
          expect.arrayContaining(["กรุณากรอกอีเมล KU", "กรุณากรอกรหัสผ่าน"])
        );
      }
    });
  });

  describe("1.3.3 local username/password validation", () => {
    it("requires non-empty username and password", () => {
      expect(
        localLoginSchema.safeParse({ username: "staff01", password: "secret" }).success
      ).toBe(true);
      expect(
        localLoginSchema.safeParse({ username: "", password: "secret" }).success
      ).toBe(false);
      expect(
        localLoginSchema.safeParse({ username: "staff01", password: "" }).success
      ).toBe(false);
    });
  });

  describe("1.3.4 password visibility toggle", () => {
    it("toggles KU password between password and text", () => {
      render(<LoginMethodKu open onToggle={vi.fn()} onSubmit={vi.fn()} />);
      const input = screen.getByLabelText("รหัสผ่าน");
      const toggle = screen.getByRole("button", { name: "แสดง" });

      expect(input).toHaveAttribute("type", "password");
      fireEvent.click(toggle);
      expect(input).toHaveAttribute("type", "text");
      expect(screen.getByRole("button", { name: "ซ่อน" })).toBeInTheDocument();
    });

    it("toggles local password between password and text", () => {
      render(<LoginMethodLocal open onToggle={vi.fn()} onSubmit={vi.fn()} />);
      const input = screen.getByLabelText("รหัสผ่าน");
      fireEvent.click(screen.getByRole("button", { name: "แสดง" }));
      expect(input).toHaveAttribute("type", "text");
    });
  });
});

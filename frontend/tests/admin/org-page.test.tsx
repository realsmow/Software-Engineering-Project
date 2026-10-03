import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminOrgPage from "../../src/features/admin/org/org-page";
import type { AdminOrg } from "../../src/features/admin/org/use-org";
import { loadingQueryResult, queryResult } from "../fixtures/query-results";
import { getErrorMessage } from "../../src/lib/error-messages";

const createFacultyMutate = vi.hoisted(() => vi.fn());
const createGroupMutate = vi.hoisted(() => vi.fn());
const orgQuery = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ faculty: false, group: false }));

vi.mock("../../src/features/admin/org/use-org", () => ({
  useAdminOrg: orgQuery,
  useCreateFaculty: () => ({ mutate: createFacultyMutate, isPending: pending.faculty }),
  useCreateGroup: () => ({ mutate: createGroupMutate, isPending: pending.group }),
}));

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

describe("Admin organization page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    pending.faculty = pending.group = false;
    orgQuery.mockReturnValue(
      queryResult<AdminOrg>({
        faculties: [{ id: 1, name: "Engineering" }],
        groups: [
          { id: 10, name: "Computer Engineering", type: "Faculty", facultyId: 1 },
          { id: 20, name: "Robotics Club", type: "Club", facultyId: null },
        ],
      })
    );
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <AdminOrgPage />
      </MemoryRouter>
    );

  it("lists faculties with their departments, and clubs", () => {
    renderPage();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Computer Engineering")).toBeInTheDocument();
    expect(screen.getByText("Robotics Club")).toBeInTheDocument();
  });

  it("creates a faculty and a club, then clears the field and confirms", () => {
    createFacultyMutate.mockImplementation((_input, options) => options.onSuccess());
    createGroupMutate.mockImplementation((_input, options) => options.onSuccess());
    renderPage();

    const facultyInput = document.getElementById("org-faculty-name") as HTMLInputElement;
    fireEvent.change(facultyInput, { target: { value: " Science " } });
    fireEvent.click(
      screen.getAllByRole("button", { name: t("admin.org.addFaculty") })[0]
    );
    expect(createFacultyMutate).toHaveBeenCalledWith(
      { name: "Science" },
      expect.any(Object)
    );
    expect(facultyInput.value).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(
      t("admin.org.created", { name: "Science" })
    );

    const clubInput = document.getElementById("org-club-name") as HTMLInputElement;
    fireEvent.change(clubInput, { target: { value: "Chess Club" } });
    fireEvent.click(screen.getAllByRole("button", { name: t("admin.org.addClub") })[0]);
    // No facultyId: the server reads that as a club.
    expect(createGroupMutate).toHaveBeenCalledWith(
      { name: "Chess Club" },
      expect.any(Object)
    );
  });

  it("keeps add department disabled until a faculty is chosen", () => {
    renderPage();
    fireEvent.change(document.getElementById("org-dept-name")!, {
      target: { value: "Physics" },
    });
    expect(
      screen.getAllByRole("button", { name: t("admin.org.addDepartment") })[0]
    ).toBeDisabled();
  });

  it("creates a department under the selected faculty and clears its name", () => {
    createGroupMutate.mockImplementation((_input, options) => options.onSuccess());
    renderPage();
    const name = document.getElementById("org-dept-name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: " Physics " } });
    fireEvent.click(screen.getByRole("combobox", { name: t("admin.org.faculty") }));
    fireEvent.click(screen.getByRole("option", { name: "Engineering" }));
    fireEvent.click(screen.getByRole("button", { name: t("admin.org.addDepartment") }));
    expect(createGroupMutate).toHaveBeenCalledWith(
      { name: "Physics", facultyId: 1 },
      expect.any(Object)
    );
    expect(name.value).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(
      t("admin.org.created", { name: "Physics" })
    );
  });

  it("does not submit blank or whitespace-only names", () => {
    renderPage();
    for (const field of ["org-faculty-name", "org-dept-name", "org-club-name"]) {
      fireEvent.change(document.getElementById(field)!, { target: { value: "   " } });
    }
    for (const name of ["addFaculty", "addDepartment", "addClub"]) {
      const button = screen.getByRole("button", { name: t(`admin.org.${name}`) });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(createFacultyMutate).not.toHaveBeenCalled();
    expect(createGroupMutate).not.toHaveBeenCalled();
  });

  it("prevents repeated faculty and club submission while saving", () => {
    pending.faculty = pending.group = true;
    renderPage();
    fireEvent.change(document.getElementById("org-faculty-name")!, {
      target: { value: "Science" },
    });
    fireEvent.change(document.getElementById("org-club-name")!, {
      target: { value: "Chess" },
    });
    for (const name of ["addFaculty", "addClub"]) {
      const button = screen.getByRole("button", { name: t(`admin.org.${name}`) });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(createFacultyMutate).not.toHaveBeenCalled();
    expect(createGroupMutate).not.toHaveBeenCalled();
  });

  it.each(["faculty", "club"] as const)(
    "keeps the %s name and shows a Thai error when creation fails",
    (kind) => {
      const error = Object.assign(new Error("FORBIDDEN"), {
        data: { businessCode: "FORBIDDEN" },
      });
      const mutate = kind === "faculty" ? createFacultyMutate : createGroupMutate;
      mutate.mockImplementation((_input, options) => options.onError(error));
      renderPage();
      const input = document.getElementById(`org-${kind}-name`) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Unsaved name" } });
      fireEvent.click(
        screen.getByRole("button", {
          name: t(kind === "faculty" ? "admin.org.addFaculty" : "admin.org.addClub"),
        })
      );
      expect(input.value).toBe("Unsaved name");
      expect(screen.getByRole("alert")).toHaveTextContent(getErrorMessage(error));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  );

  it("shows loading without claiming the organization is empty", () => {
    orgQuery.mockReturnValue(loadingQueryResult<AdminOrg>());
    renderPage();
    expect(screen.getByText(t("common.loading"))).toBeInTheDocument();
    expect(screen.queryByText(t("admin.org.noFaculties"))).not.toBeInTheDocument();
    expect(screen.queryByText(t("admin.org.noClubs"))).not.toBeInTheDocument();
  });
});

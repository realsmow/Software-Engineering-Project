import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../src/i18n";
import AdminOrgPage from "../../src/features/admin/org/org-page";

const createFacultyMutate = vi.hoisted(() => vi.fn());
const createGroupMutate = vi.hoisted(() => vi.fn());

vi.mock("../../src/features/admin/org/use-org", () => ({
  useAdminOrg: () => ({
    data: {
      faculties: [{ id: 1, name: "Engineering" }],
      groups: [
        { id: 10, name: "Computer Engineering", type: "Faculty", facultyId: 1 },
        { id: 20, name: "Robotics Club", type: "Club", facultyId: null },
      ],
    },
    isLoading: false,
  }),
  useCreateFaculty: () => ({ mutate: createFacultyMutate, isPending: false }),
  useCreateGroup: () => ({ mutate: createGroupMutate, isPending: false }),
}));

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

describe("Admin organization page", () => {
  beforeEach(() => vi.clearAllMocks());

  const renderPage = () =>
    render(
      <MemoryRouter>
        <AdminOrgPage />
      </MemoryRouter>,
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
    fireEvent.click(screen.getAllByRole("button", { name: t("admin.org.addFaculty") })[0]);
    expect(createFacultyMutate).toHaveBeenCalledWith({ name: "Science" }, expect.any(Object));
    expect(facultyInput.value).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(t("admin.org.created", { name: "Science" }));

    const clubInput = document.getElementById("org-club-name") as HTMLInputElement;
    fireEvent.change(clubInput, { target: { value: "Chess Club" } });
    fireEvent.click(screen.getAllByRole("button", { name: t("admin.org.addClub") })[0]);
    // No facultyId: the server reads that as a club.
    expect(createGroupMutate).toHaveBeenCalledWith({ name: "Chess Club" }, expect.any(Object));
  });

  it("keeps add department disabled until a faculty is chosen", () => {
    renderPage();
    fireEvent.change(document.getElementById("org-dept-name")!, { target: { value: "Physics" } });
    expect(screen.getAllByRole("button", { name: t("admin.org.addDepartment") })[0]).toBeDisabled();
  });
});

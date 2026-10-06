import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en.json";
import th from "@/i18n/locales/th.json";

describe("cron job labels", () => {
  const ids = ["markOverdue", "markLost", "expireDemerits", "dueSoonReminder", "openT3InspectionRounds", "expireStaleRequests"];
  it("have a name and schedule in both languages for every job id", () => {
    for (const id of ids) {
      for (const locale of [en, th]) {
        const job = (locale.admin.status.jobs as Record<string, { name: string; schedule: string }>)[id];
        expect(job.name).toBeTruthy();
        expect(job.schedule).toBeTruthy();
      }
    }
    expect(en.admin.status.jobs.expireStaleRequests.schedule).toBe("Hourly");
  });
});

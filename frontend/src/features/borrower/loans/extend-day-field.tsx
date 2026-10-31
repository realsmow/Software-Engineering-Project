import { useTranslation } from "react-i18next";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/datetime";
import type { LoanExtension } from "./use-extensions";

/**
 * Pick the new return day. Asking for only the days needed hands the rest
 * back to the next borrower; the button still takes the whole allowance.
 */
export function ExtendDayField({ extension }: { extension: LoanExtension }) {
  const { t } = useTranslation();
  const { day, setDay, minDay, maxDay } = extension;
  if (!day || !minDay || !maxDay) return null;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-t2">
          {t("borrower.myRequests.extPickDay")}
        </span>
        <DateInput
          value={day}
          min={minDay}
          max={maxDay}
          onChange={(iso) => iso && setDay(iso)}
          ariaLabel={t("borrower.myRequests.extPickDay")}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={day === maxDay}
        onClick={() => setDay(maxDay)}
      >
        {t("borrower.myRequests.extFull", { date: fmtDate(maxDay) })}
      </Button>
    </div>
  );
}

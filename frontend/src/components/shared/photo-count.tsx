import { useTranslation } from "react-i18next";
import { UPLOAD } from "@/constants";

/** #238: how many photos a stage has against the cap, e.g. "3/30 รูป". */
export function PhotoCount({ count, className }: { count: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={["text-[11px] text-t4", className ?? ""].join(" ").trim()}>
      {t("common.photoCount", { count, max: UPLOAD.MAX_PHOTOS_PER_STAGE })}
    </span>
  );
}

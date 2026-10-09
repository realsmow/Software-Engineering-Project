import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ImageThumb } from "@/components/shared/image-thumb";
import type { UsagePhotoSet } from "@/features/borrower/pickup/use-pickup-image-upload";

type Stage = "before" | "after" | "inspection";

/**
 * Photos already on file for a loan, grouped by stage. A thumbnail opens the
 * full photo; the x removes it so it can be taken again. Inspection photos
 * come from grading and are never removable here.
 */
export function UsagePhotoGallery({
  photos,
  stages = ["before", "after", "inspection"],
  disabled,
  pendingImageKey,
  onRemove,
  size = 48,
  showLabels = true,
}: {
  photos: UsagePhotoSet;
  stages?: Stage[];
  disabled: boolean;
  pendingImageKey?: number;
  onRemove: (imageKey: number) => void;
  size?: number;
  showLabels?: boolean;
}) {
  const { t } = useTranslation();
  const label: Record<Stage, string> = {
    before: t("borrower.pickup.stageBefore"),
    after: t("borrower.pickup.stageAfter"),
    inspection: t("borrower.pickup.stageInspection"),
  };
  const groups = stages.filter((stage) => photos[stage].length > 0);
  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {groups.map((stage) => (
        <div key={stage}>
          {showLabels ? (
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-t4">
              {label[stage]}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {photos[stage].map((photo) => (
              <div key={photo.imageKey} className="relative">
                <a
                  href={photo.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("common.viewPhoto")}
                >
                  <ImageThumb src={photo.imageUrl} size={size} />
                </a>
                {stage !== "inspection" ? (
                  <button
                    type="button"
                    aria-label={t("borrower.pickup.removePhoto")}
                    disabled={disabled || pendingImageKey === photo.imageKey}
                    onClick={() => onRemove(photo.imageKey)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-t3 shadow-sm disabled:opacity-50"
                  >
                    <X size={11} strokeWidth={2.6} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

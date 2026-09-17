import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * A picture of a thing, or the icon that stands in for one.
 *
 * Every catalogue surface had its own grey box with an icon in it and no way
 * to show an actual photo, so `imageUrl` arrived from the server and was
 * dropped. This renders it when there is one and keeps the old placeholder
 * when there is not.
 *
 * A broken `src` falls back to the icon rather than leaving a torn-image glyph.
 * That case is ordinary here, not exceptional: files under `/media/` are
 * uploaded at runtime and gitignored, so a fresh clone has database rows
 * pointing at images that machine has never had.
 */
export function ImageThumb({
  src,
  alt,
  size,
  icon: Icon = Package,
  className,
}: {
  src?: string | null;
  /** Describes the item, not the picture. Empty when a name would only repeat the row beside it. */
  alt?: string;
  /** Fixed square in px. Omit and size it with `className` instead, for a
   *  frame that has to be responsive. */
  size?: number;
  icon?: LucideIcon;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A recycled row in a list can hand the same element a different src.
  useEffect(() => setFailed(false), [src]);

  const frame =
    "flex shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-inset text-t4";
  const box = size === undefined ? undefined : { width: size, height: size };
  const iconSize = size !== undefined && size < 56 ? 18 : 24;

  if (!src || failed) {
    return (
      <div className={`${frame} ${className ?? ""}`} style={box} aria-hidden>
        <Icon size={iconSize} strokeWidth={1.6} />
      </div>
    );
  }

  return (
    <div className={`${frame} ${className ?? ""}`} style={box}>
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

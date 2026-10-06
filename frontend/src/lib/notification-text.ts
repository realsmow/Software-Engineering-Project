import i18n from "i18next";
import type { Notification } from "../types/domain";

/**
 * The text to show for a notification. The server stores Thai and, for newer
 * rows, an English twin; older rows have no English and fall back to Thai.
 */
export function notificationText(n: Pick<Notification, "title" | "body" | "titleEn" | "bodyEn">): {
  title: string;
  body: string;
} {
  const en = i18n.language?.startsWith("en") ?? false;
  return {
    title: (en && n.titleEn) || n.title,
    body: (en && n.bodyEn) || n.body,
  };
}

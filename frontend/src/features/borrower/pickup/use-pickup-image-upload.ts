import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTRPCClient } from "@/lib/trpc";
import type { PreparedBorrowerImage } from "../uploads/prepared-image";

interface UploadPickupImageInput {
  usageKey: number;
  image: PreparedBorrowerImage;
}

/**
 * Collection photos: request a ticket, PUT the bytes, attach the stored URL.
 *
 * This previously called `loan.requestPickupImageUpload` and
 * `loan.attachPickupImage`, which do not exist on the server. It type-checked
 * because `server/trpc-contract.ts` is a hand-written mirror and declared them,
 * so the mismatch only showed up as a failed call at the counter. The real
 * procedures live on the image router and are named differently.
 *
 * `before` is the stage taken at pickup; `after` is the matching set at return.
 */
export function usePickupImageUpload() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: async ({ usageKey, image }: UploadPickupImageInput) => {
      // Not `image.requestUpload`: that one is staff-only, so a borrower
      // standing at the counter could never get a URL from it. This one checks
      // the loan is theirs and fixes the purpose server-side.
      const ticket = await trpc.image.requestUsagePhotoUpload.mutate({
        usageKey,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
      });

      await apiClient.uploadFile(ticket.uploadUrl, image.file);

      const attached = await trpc.image.attachUsagePhotos.mutate({
        usageKey,
        stage: "before",
        imageUrls: [ticket.imageUrl],
      });

      // `attachUsagePhotos` answers with every photo on the loan, grouped by
      // stage, not with the row it just wrote. Pick ours back out by URL.
      const evidence =
        attached.before.find((photo) => photo.imageUrl === ticket.imageUrl) ??
        attached.before[attached.before.length - 1];

      return {
        evidence,
        image: {
          ...image,
          status: "uploaded" as const,
          imageUrl: evidence?.imageUrl ?? ticket.imageUrl,
          error: undefined,
        },
      };
    },
  });
}

/**
 * Starts every selected loan once its photos are filed.
 *
 * `loan.confirmMyPickup` takes one loan, so this walks the list. That is a real
 * difference from the single transaction the old (nonexistent)
 * `loan.finalizePickup` implied: if the third of five fails, the first two are
 * already collected. Sequential rather than parallel so the failure point is
 * the loan actually reported, and the ones after it are untouched.
 */
export function useFinalizePickup() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (usageKeys: number[]) => {
      const confirmed: number[] = [];
      for (const usageKey of usageKeys) {
        await trpc.loan.confirmMyPickup.mutate({ usageKey });
        confirmed.push(usageKey);
      }
      return { finalizedUsageKeys: confirmed };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loan", "my-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-types"] }),
      ]);
    },
  });
}

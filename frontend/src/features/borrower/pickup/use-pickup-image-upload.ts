import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTRPCClient } from "@/lib/trpc";
import type { PreparedBorrowerImage } from "../uploads/prepared-image";

interface UploadPickupImageInput {
  usageKey: number;
  image: PreparedBorrowerImage;
}

/** One photo on file against a loan (`usagePhotoOutput` in backend/src/image/image.schema.ts). */
export interface UsagePhoto {
  imageKey: number;
  imageUrl: string;
  stage: "before" | "after" | "inspection";
  submittedBy: number;
  submittedAt: string | null;
}

/** Both sides of one loan's photo record (`usagePhotosOutput`), grouped by stage. */
export interface UsagePhotoSet {
  before: UsagePhoto[];
  after: UsagePhoto[];
  inspection: UsagePhoto[];
}

const usagePhotosKey = (usageKey: number | null) => ["image", "usagePhotos", usageKey] as const;

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
  const queryClient = useQueryClient();

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

      // `attachUsagePhotos` returns the loan's full, current photo set - the
      // same shape `useUsagePhotos` reads. Write it straight into that cache
      // so the gallery reflects what was just filed instead of last session's
      // set until something else happens to refetch it.
      queryClient.setQueryData(usagePhotosKey(usageKey), attached);

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
 * What is already filed against this loan, grouped by stage.
 *
 * Idle until a usage key exists - a request staff have not yet allocated a
 * unit for has nothing to look up.
 */
export function useUsagePhotos(usageKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: usagePhotosKey(usageKey),
    enabled: usageKey !== null,
    queryFn: (): Promise<UsagePhotoSet> =>
      trpc.image.usagePhotos.query({ usageKey: usageKey as number }),
  });
}

/**
 * Removes one photo the borrower filed by mistake.
 *
 * The server restricts this to the caller's own photo, and only while the
 * stage it belongs to is still open - a refusal here is an expected outcome,
 * not a bug, so the caller must show it rather than assume the remove worked.
 */
export function useDetachUsagePhoto() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { usageKey: number; imageKey: number }) =>
      trpc.image.detachUsagePhoto.mutate({ imageKey: vars.imageKey }),
    onSuccess: (result, vars) => {
      queryClient.setQueryData(usagePhotosKey(vars.usageKey), result);
    },
  });
}

/**
 * Starts every selected loan once its photos are filed.
 *
 * `loan.confirmPickup` takes one loan, so this walks the list. That is a real
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
        await trpc.loan.confirmPickup.mutate({ usageKey });
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

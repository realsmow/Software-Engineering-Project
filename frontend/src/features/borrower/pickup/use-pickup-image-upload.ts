import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTRPCClient } from "@/lib/trpc";
import type { PreparedBorrowerImage } from "../uploads/prepared-image";

interface UploadPickupImageInput {
  usageKey: number;
  image: PreparedBorrowerImage;
}

/** Presigned direct-to-storage upload followed by the database attachment. */
export function usePickupImageUpload() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: async ({ usageKey, image }: UploadPickupImageInput) => {
      const ticket = await trpc.loan.requestPickupImageUpload.mutate({
        usageKey,
        contentType: image.contentType,
        sizeBytes: image.sizeBytes,
      });

      await apiClient.uploadFile(ticket.uploadUrl, image.file, ticket.uploadHeaders);

      const evidence = await trpc.loan.attachPickupImage.mutate({
        usageKey,
        objectKey: ticket.objectKey,
        uploadToken: ticket.uploadToken,
      });

      return {
        evidence,
        image: {
          ...image,
          status: "uploaded" as const,
          imageUrl: evidence.imageUrl,
          error: undefined,
        },
      };
    },
  });
}

/**
 * Starts every selected loan only after all of its BeforePicture rows exist.
 * The backend owns the transaction; the frontend only requests it and then
 * replaces its view with fresh server state.
 */
export function useFinalizePickup() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (usageKeys: number[]) => trpc.loan.finalizePickup.mutate({ usageKeys }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["loan", "my-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-types"] }),
      ]);
    },
  });
}

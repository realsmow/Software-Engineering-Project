import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTRPCClient } from "@/lib/trpc";

/**
 * Put a picture on a catalogue item.
 *
 * Three steps, and the middle one deliberately bypasses tRPC: the bytes go
 * straight to the signed `uploadUrl` as a plain PUT. That URL carries no
 * cookies, so what authorises it is the HMAC signature baked into the token -
 * scoped to one storage key, one content type, one size, ten minutes.
 *
 * The ticket is requested at submit time rather than when the form opens,
 * because it expires.
 */
export type UploadPurpose = "itemType" | "itemUnit" | "room" | "inspection";

export function useUploadImage() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: async ({ file, purpose }: { file: File; purpose: UploadPurpose }) => {
      const ticket = await trpc.image.requestUpload.mutate({
        purpose,
        contentType: file.type,
        sizeBytes: file.size,
      });

      // Declared size and type are signed into the ticket, so the server
      // refuses a mismatch rather than storing whatever arrives.
      await apiClient.uploadFile(ticket.uploadUrl, file);

      return ticket;
    },
  });
}

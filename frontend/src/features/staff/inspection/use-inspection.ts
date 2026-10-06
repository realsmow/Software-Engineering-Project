import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useTRPCClient } from "@/lib/trpc";
import { fetchAllPages } from "@/lib/paging";
import type {
  DamageLevel,
  InspectionQueueRow,
  InspectionResult,
  InspectionSubject,
} from "./inspection.types";

/**
 * The inspection desk's data layer.
 *
 * Not polled. Unlike the counter queue, nothing arrives here without a staff
 * member having just put it there by recording a return, and a background
 * refetch mid-grading would swap the subject under the inspector.
 */
const INSPECTION_KEY = ["staff", "inspection"] as const;

export function useInspectionQueue() {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INSPECTION_KEY, "queue"],
    queryFn: async (): Promise<InspectionQueueRow[]> =>
      fetchAllPages((page, pageSize) => trpc.inspection.list.query({ page, pageSize })),
  });
}

/** One return, laid out for the comparison. Only fetched once a row is opened. */
export function useInspectionSubject(usageKey: number | null) {
  const trpc = useTRPCClient();

  return useQuery({
    queryKey: [...INSPECTION_KEY, "subject", usageKey],
    queryFn: async (): Promise<InspectionSubject | null> =>
      usageKey === null ? null : trpc.inspection.getById.query({ usageKey }),
    enabled: usageKey !== null,
  });
}

/**
 * Record the grade.
 *
 * Invalidates the counter's queue as well: grading is what takes a unit out of
 * the pool or puts it back, so the availability the counter shows changes here.
 */
export function useCreateInspection() {
  const trpc = useTRPCClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      usageKey: number;
      level: DamageLevel;
      note?: string;
      imageUrls?: string[];
    }): Promise<InspectionResult> => trpc.inspection.create.mutate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: INSPECTION_KEY });
      void queryClient.invalidateQueries({ queryKey: ["staff", "queue"] });
      void queryClient.invalidateQueries({ queryKey: ["equipment-types"] });
    },
  });
}

/**
 * Upload one inspection photo and hand back the URL to grade with (#137).
 *
 * Only the ticket and the PUT: `inspection.create` is what files the URL as an
 * InspectionPicture, so nothing is attached to the loan until the grade is.
 */
export function useUploadInspectionPhoto() {
  const trpc = useTRPCClient();

  return useMutation({
    mutationFn: async (input: { usageKey: number; file: File }): Promise<string> => {
      const ticket = await trpc.image.requestUsagePhotoUpload.mutate({
        usageKey: input.usageKey,
        contentType: input.file.type as "image/jpeg" | "image/png",
        sizeBytes: input.file.size,
      });
      await apiClient.uploadFile(ticket.uploadUrl, input.file);
      return ticket.imageUrl;
    },
  });
}

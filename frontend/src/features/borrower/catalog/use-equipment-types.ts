import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-client";
import type { EquipmentType } from "@/types/domain";

/**
 * useEquipmentTypes — equipment catalog list for the borrower view.
 *
 * No API is wired yet (brief note #5): the queryFn returns typed mock data so
 * the catalog page can render. When the backend lands, swap the queryFn for an
 * apiClient call to GET /equipment-types (keys already live in query-client).
 */
const MOCK_EQUIPMENT_TYPES: EquipmentType[] = [
  {
    id: "eq-oscilloscope",
    name: "ออสซิลโลสโคป 100MHz",
    categoryId: "cat-measure",
    tier: "T2",
    creditWeight: 10,
    prepDays: 1,
    totalUnits: 8,
    availableUnits: 3,
  },
  {
    id: "eq-multimeter",
    name: "ดิจิทัลมัลติมิเตอร์",
    categoryId: "cat-measure",
    tier: "T1",
    creditWeight: 5,
    prepDays: 0,
    totalUnits: 24,
    availableUnits: 17,
  },
  {
    id: "eq-soldering",
    name: "ชุดหัวแร้งบัดกรี",
    categoryId: "cat-tools",
    tier: "T0",
    creditWeight: 0,
    prepDays: 0,
    totalUnits: 15,
    availableUnits: 0,
    nextAvailableAt: "2026-08-09T09:00:00+07:00",
  },
  {
    id: "eq-labroom-a",
    name: "ห้องปฏิบัติการ A (T3)",
    categoryId: "cat-facility",
    tier: "T3",
    creditWeight: 0,
    prepDays: 0,
    totalUnits: 1,
    availableUnits: 1,
  },
];

export function useEquipmentTypes(filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: queryKeys.equipmentTypes(filters),
    queryFn: async (): Promise<EquipmentType[]> => MOCK_EQUIPMENT_TYPES,
  });
}

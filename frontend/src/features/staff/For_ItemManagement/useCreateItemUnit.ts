// import { useState } from 'react';
// import { trpc } from '../lib/trpc'; 
// import { toast } from 'sonner'; 

// // รับ itemKey เข้ามาผ่าน props ของ Hook
// interface UseCreateItemUnitProps {
//   itemKey: string;
// }

// export function useCreateItemUnit({ itemKey }: UseCreateItemUnitProps) {
//   const [manageGroupKey, setManageGroupKey] = useState('');
//   const [tier, setTier] = useState(''); 
//   const [serialNo, setSerialNo] = useState('');
//   const [quantity, setQuantity] = useState<number>(1);
//   const [prepDays, setPrepDays] = useState<number>(0);
//   const [lendable, setLendable] = useState<boolean>(true);
//   const [imageUrl, setImageUrl] = useState('');

//   // ลอจิกตรวจสอบว่าต้องบังคับกรอก Serial No. หรือไม่
//   const isSerialRequired = tier === 'T1' || tier === 'T2';

//   // แยก Logic จัดการ Tier ออกมาเพื่อให้ UI คลีนๆ
//   const handleTierChange = (newTier: string) => {
//     setTier(newTier);
//     if (newTier === 'T0') {
//       setSerialNo(''); // เคลียร์ค่า Serial ทิ้งถ้าผู้ใช้เปลี่ยนใจกลับมาเลือก T0
//     }
//   };

//   const createMutation = trpc.itemUnit.create.useMutation({
//     onSuccess: () => {
//       toast.success('สร้าง Item Unit สำเร็จ!');
//       // เคลียร์ฟอร์ม
//       setManageGroupKey('');
//       setTier('');
//       setSerialNo('');
//       setQuantity(1);
//       setPrepDays(0);
//       setLendable(true);
//       setImageUrl('');
//     },
//     onError: (error) => {
//       toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
//     }
//   });

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
    
//     createMutation.mutate({
//       itemKey,
//       manageGroupKey,
//       tier,
//       serialNo: serialNo.trim() || undefined,
//       imageUrl: imageUrl.trim() || undefined,
//       prepDays,
//       lendable,
//       quantity,
//     });
//   };

//   return {
//     manageGroupKey, setManageGroupKey,
//     tier, handleTierChange,
//     serialNo, setSerialNo,
//     quantity, setQuantity,
//     prepDays, setPrepDays,
//     lendable, setLendable,
//     imageUrl, setImageUrl,
//     isSerialRequired,
//     handleSubmit,
//     isCreating: createMutation.isPending,
//   };
// }
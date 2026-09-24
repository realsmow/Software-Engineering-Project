// import { useState } from 'react';
// import { trpc } from '../lib/trpc'; 
// import { toast } from 'sonner'; 

// export function useCreateRoom() {
//   // บังคับกรอก
//   const [manageGroupKey, setManageGroupKey] = useState<number | ''>('');
//   const [name, setName] = useState('');
  
//   // มีค่า Default
//   const [lendable, setLendable] = useState<boolean>(true);
//   const [creditWeight, setCreditWeight] = useState<number>(0);
  
//   // ไม่บังคับ
//   const [description, setDescription] = useState('');
//   const [location, setLocation] = useState('');
//   const [imageUrl, setImageUrl] = useState('');
//   const [capacity, setCapacity] = useState<number | ''>('');

//   // สมมติว่า tRPC router ของคุณชื่อ room (ถ้าเป็นชื่ออื่นสามารถแก้ได้เลยครับ)
//   const createMutation = trpc.room.create.useMutation({
//     onSuccess: () => {
//       toast.success('สร้างห้องสำเร็จ!');
//       // เคลียร์ค่าฟอร์มทั้งหมดกลับเป็นค่าเริ่มต้น
//       setManageGroupKey('');
//       setName('');
//       setLendable(true);
//       setCreditWeight(0);
//       setDescription('');
//       setLocation('');
//       setImageUrl('');
//       setCapacity('');
//     },
//     onError: (error) => {
//       toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
//     }
//   });

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
    
//     // ตรวจสอบข้อมูลก่อนส่ง (เปลี่ยนจาก alert เป็น toast)
//     if (manageGroupKey === '') {
//       toast.error('กรุณาระบุกลุ่มที่ดูแลห้อง (manageGroupKey)');
//       return;
//     }

//     // ส่งข้อมูลไป Backend
//     createMutation.mutate({
//       manageGroupKey: Number(manageGroupKey),
//       name: name.trim(),
//       description: description.trim() || undefined,
//       location: location.trim() || undefined,
//       imageUrl: imageUrl.trim() || undefined,
//       creditWeight,
//       capacity: capacity === '' ? undefined : Number(capacity),
//       lendable,
//     });
//   };

//   return {
//     manageGroupKey, setManageGroupKey,
//     name, setName,
//     lendable, setLendable,
//     creditWeight, setCreditWeight,
//     description, setDescription,
//     location, setLocation,
//     imageUrl, setImageUrl,
//     capacity, setCapacity,
//     handleSubmit,
//     isCreating: createMutation.isPending,
//   };
// }
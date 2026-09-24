// import { useState } from 'react';
// import { trpc } from '../lib/trpc'; 
// import { toast } from 'sonner'; 

// export function useCreateItemType() {
//   const [name, setName] = useState('');
//   const [description, setDescription] = useState('');
//   const [imageUrl, setImageUrl] = useState('');
//   const [creditWeight, setCreditWeight] = useState<number>(0);

//   const createMutation = trpc.itemType.create.useMutation({
//     onSuccess: () => {
//       toast.success('สร้าง Item Type สำเร็จ!');
//       // เคลียร์ค่าฟอร์มเมื่อสำเร็จ
//       setName('');
//       setDescription('');
//       setImageUrl('');
//       setCreditWeight(0);
//     },
//     onError: (error) => {
//       toast.error(`เกิดข้อผิดพลาด: ${error.message}`);
//     }
//   });

//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
    
//     // ส่งข้อมูลไป Backend ผ่าน Mutation ที่เราสร้างไว้ข้างบน
//     createMutation.mutate({
//       name: name.trim(),
//       description: description.trim() || undefined,
//       imageUrl: imageUrl.trim() || undefined,
//       creditWeight,
//     });
//   };

//   return {
//     name,
//     setName,
//     description,
//     setDescription,
//     imageUrl,
//     setImageUrl,
//     creditWeight,
//     setCreditWeight,
//     handleSubmit,
//     isCreating: createMutation.isPending, // ส่งสถานะกลับไปให้ UI
//   };
// }
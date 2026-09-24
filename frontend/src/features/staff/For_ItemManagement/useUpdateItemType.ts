//Please remind: Some is not corrected.If you have questions, feel free to ask me directly.
//Haven't Test on real DB.

// import { useState } from 'react';
// //import { trpc } from '../lib/trpc'; // นำเข้า tRPC ของโปรเจกต์คุณ
// //import { toast } from 'sonner';

// // --- จำลองข้อมูล (Mock Data) เดี๋ยวค่อยเปลี่ยนเป็น trpc.useQuery from AI--- 
// const mockData = [
//   { itemKey: 'ITEM-001', name: 'iPad Pro', description: 'Apple Tablet', creditWeight: 10, imageUrl: '' },
//   { itemKey: 'ITEM-002', name: 'กล้อง Sony A7IV', description: 'Mirrorless Camera', creditWeight: 50, imageUrl: '' },
//   { itemKey: 'ITEM-003', name: 'สมาร์ททีวี Samsung', description: 'Smart TV', creditWeight: 20, imageUrl: '' },
//   { itemKey: 'ITEM-004', name: 'Apple Pencil', description: 'Stylus', creditWeight: 2, imageUrl: '' },
//   { itemKey: 'ITEM-005', name: 'กระดานไวท์บอร์ด', description: 'Whiteboard', creditWeight: 0, imageUrl: '' },
//   { itemKey: 'ITEM-006', name: 'ไมโครโฟน Shure', description: 'Mic', creditWeight: 5, imageUrl: '' },
//   { itemKey: 'ITEM-007', name: 'Zebra Pen', description: 'Pen', creditWeight: 0, imageUrl: '' },
//   { itemKey: 'ITEM-008', name: 'โปรเจคเตอร์ Epson', description: 'Projector', creditWeight: 30, imageUrl: '' },
//   { itemKey: 'ITEM-009', name: 'เก้าอี้สำนักงาน', description: 'Office Chair', creditWeight: 10, imageUrl: '' },
//   { itemKey: 'ITEM-010', name: 'โต๊ะคอมพิวเตอร์', description: 'Desk', creditWeight: 15, imageUrl: '' },
//   { itemKey: 'ITEM-011', name: 'Dell Monitor', description: 'Monitor', creditWeight: 12, imageUrl: '' },
//   { itemKey: 'ITEM-012', name: 'คีย์บอร์ด Keychron', description: 'Mechanical Keyboard', creditWeight: 4, imageUrl: '' },
// ];


// export function updateItemType() {

//   //const utils = trpc.useUtils(); // เครื่องมือสำหรับสั่ง Invalidate (รีเฟรชข้อมูล)

//   // 1. Query: ดึงข้อมูลจริงจาก Backend
//   // สมมติว่า backend ของคุณชื่อ route ว่า itemType.getAll (ปรับชื่อตามจริงได้เลย)
//   //const { data: items = [], isLoading: isFetching } = trpc.itemType.getAll.useQuery();

//   // --- States สำหรับหน้า List ---
//   const [searchTerm, setSearchTerm] = useState('');
//   const [currentPage, setCurrentPage] = useState(1);
//   const itemsPerPage = 10;

//   // --- State สำหรับหน้า Edit ---
//   const [editingItem, setEditingItem] = useState<any | null>(null);
//   const [editName, setEditName] = useState('');
//   const [editDesc, setEditDesc] = useState('');
//   const [editCredit, setEditCredit] = useState(0);
//   const [editImage, setEditImage] = useState('');

//   // --- Logic ระบบค้นหาและเรียงลำดับ ---
//   const filteredItems = mockData.filter((item) => {
//     const term = searchTerm.toLowerCase();
//     return (
//       item.itemKey.toLowerCase().includes(term) ||
//       item.name.toLowerCase().includes(term)
//     );
//   });

//   const sortedItems = [...filteredItems].sort((a, b) => {
//     const isEng = (char: string) => /^[a-zA-Z]/.test(char);
//     const aEng = isEng(a.name[0]);
//     const bEng = isEng(b.name[0]);
//     if (aEng && !bEng) return -1; 
//     if (!aEng && bEng) return 1;  
//     return a.name.localeCompare(b.name, 'th'); 
//   });

//   const totalPages = Math.ceil(sortedItems.length / itemsPerPage) || 1;
//   const paginatedItems = sortedItems.slice(
//     (currentPage - 1) * itemsPerPage,
//     currentPage * itemsPerPage
//   );

//   const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setSearchTerm(e.target.value);
//     setCurrentPage(1); // รีเซ็ตหน้าเมื่อค้นหาใหม่
//   };

//   // --- ฟังก์ชันจัดการการคลิกแก้ไข ---
//   const handleEditClick = (item: any) => {
//     setEditingItem(item);
//     setEditName(item.name);
//     setEditDesc(item.description || '');
//     setEditCredit(item.creditWeight || 0);
//     setEditImage(item.imageUrl || '');
//   };

//   const handleCancelEdit = () => {
//     setEditingItem(null);
//   };

//   // 2. Mutation: สำหรับการอัปเดตข้อมูล
//   const updateMutation = trpc.itemType.update.useMutation({
//     onSuccess: () => {
//       toast.success('อัปเดตข้อมูลสำเร็จ!');
//       setEditingItem(null); // ปิดหน้าฟอร์ม กลับไปหน้าตาราง
//       //utils.itemType.getAll.invalidate(); // 3. สั่งรีเฟรชข้อมูลตาราง
//     },
//     onError: (err) => toast.error(`แก้ไขไม่สำเร็จ: ${err.message}`)
//   });

//   // --- ฟังก์ชันบันทึกข้อมูล (เดี๋ยวค่อยเชื่อม trpc.useMutation) ---
//   const handleUpdateSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     const payload = {
//       itemKey: editingItem.itemKey,
//       name: editName.trim() || undefined,
//       description: editDesc.trim() || undefined,
//       imageUrl: editImage.trim() || undefined,
//       creditWeight: editCredit,
//     };
    
//     console.log('Update Payload:', payload);
//     alert(`จำลองอัปเดต ${editingItem.itemKey} สำเร็จ!`);
//     setEditingItem(null);
//   };

//   // 2. Mutation: สำหรับการลบข้อมูล (สมมติว่ามี route delete)
//   const deleteMutation = trpc.itemType.delete.useMutation({
//     onSuccess: () => {
//       toast.success('ลบข้อมูลเรียบร้อยแล้ว');
//       setEditingItem(null); // ปิดหน้าฟอร์ม กลับไปหน้าตาราง
//       //utils.itemType.getAll.invalidate(); // 3. สั่งรีเฟรชข้อมูลตาราง
//     },
//     onError: (err) => toast.error(`ลบไม่สำเร็จ: ${err.message}`)
//   });

//   // --- ปรับปรุงฟังก์ชันลบ: ดึงค่าจาก editingItem ได้เลย ---
//   const handleDeleteClick = () => {
//     if (!editingItem) return;
    
//     const isConfirm = window.confirm(`คุณต้องการลบ "${editingItem.name}" (รหัส: ${editingItem.itemKey}) ใช่หรือไม่? \nการกระทำนี้ไม่สามารถกู้คืนได้`);
    
//     if (isConfirm) {
//       setItems((prev) => prev.filter((item) => item.itemKey !== editingItem.itemKey));
//       alert(`ลบ ${editingItem.itemKey} เรียบร้อยแล้ว`);
//       setEditingItem(null); // ลบเสร็จให้กลับไปหน้าตาราง
//     }
//   };

//   return {
//     searchTerm, handleSearchChange,
//     paginatedItems, currentPage, setCurrentPage, totalPages,
//     editingItem,
//     editName, setEditName,
//     editDesc, setEditDesc,
//     editCredit, setEditCredit,
//     editImage, setEditImage,
//     handleEditClick, handleCancelEdit, 
//     handleUpdateSubmit, handleDeleteClick,
    
//     // ส่งสถานะโหลดกลับไปให้ UI ใช้เพื่อทำ Loading Spinner หรือปิดปุ่ม
//     isFetching,
//     isUpdating: updateMutation.isPending,
//     isDeleting: deleteMutation.isPending,
//   };
// }


// // For Test Part
// import { useState } from 'react';

// // --- จำลองข้อมูล (Mock Data) ---
// const initialMockData = [
//   { itemKey: 'ITEM-001', name: 'iPad Pro', description: 'Apple Tablet', creditWeight: 10, imageUrl: '' },
//   { itemKey: 'ITEM-002', name: 'กล้อง Sony A7IV', description: 'Mirrorless Camera', creditWeight: 50, imageUrl: '' },
//   { itemKey: 'ITEM-003', name: 'สมาร์ททีวี Samsung', description: 'Smart TV', creditWeight: 20, imageUrl: '' },
//   { itemKey: 'ITEM-004', name: 'Apple Pencil', description: 'Stylus', creditWeight: 2, imageUrl: '' },
//   { itemKey: 'ITEM-005', name: 'กระดานไวท์บอร์ด', description: 'Whiteboard', creditWeight: 0, imageUrl: '' },
//   { itemKey: 'ITEM-006', name: 'ไมโครโฟน Shure', description: 'Mic', creditWeight: 5, imageUrl: '' },
//   { itemKey: 'ITEM-007', name: 'Zebra Pen', description: 'Pen', creditWeight: 0, imageUrl: '' },
//   { itemKey: 'ITEM-008', name: 'โปรเจคเตอร์ Epson', description: 'Projector', creditWeight: 30, imageUrl: '' },
//   { itemKey: 'ITEM-009', name: 'เก้าอี้สำนักงาน', description: 'Office Chair', creditWeight: 10, imageUrl: '' },
//   { itemKey: 'ITEM-010', name: 'โต๊ะคอมพิวเตอร์', description: 'Desk', creditWeight: 15, imageUrl: '' },
//   { itemKey: 'ITEM-011', name: 'Dell Monitor', description: 'Monitor', creditWeight: 12, imageUrl: '' },
//   { itemKey: 'ITEM-012', name: 'คีย์บอร์ด Keychron', description: 'Mechanical Keyboard', creditWeight: 4, imageUrl: '' },
// ];

// export function useUpdateItemType() {
  
//   const [items, setItems] = useState(initialMockData);

//   // --- States สำหรับหน้า List ---
//   const [searchTerm, setSearchTerm] = useState('');
//   const [currentPage, setCurrentPage] = useState(1);
//   const itemsPerPage = 10;

//   // --- State สำหรับหน้า Edit ---
//   const [editingItem, setEditingItem] = useState<any | null>(null);
//   const [editName, setEditName] = useState('');
//   const [editDesc, setEditDesc] = useState('');
//   const [editCredit, setEditCredit] = useState(0);
//   const [editImage, setEditImage] = useState('');

//   // --- Logic ระบบค้นหาและเรียงลำดับ (เปลี่ยนมาใช้ items แทน mockData) ---
//   const filteredItems = items.filter((item) => {
//     const term = searchTerm.toLowerCase();
//     return (
//       item.itemKey.toLowerCase().includes(term) ||
//       item.name.toLowerCase().includes(term)
//     );
//   });

//   const sortedItems = [...filteredItems].sort((a, b) => {
//     const isEng = (char: string) => /^[a-zA-Z]/.test(char);
//     const aEng = isEng(a.name[0]);
//     const bEng = isEng(b.name[0]);
//     if (aEng && !bEng) return -1; 
//     if (!aEng && bEng) return 1;  
//     return a.name.localeCompare(b.name, 'th'); 
//   });

//   const totalPages = Math.ceil(sortedItems.length / itemsPerPage) || 1;
//   const paginatedItems = sortedItems.slice(
//     (currentPage - 1) * itemsPerPage,
//     currentPage * itemsPerPage
//   );

//   const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setSearchTerm(e.target.value);
//     setCurrentPage(1); 
//   };

//   const handleEditClick = (item: any) => {
//     setEditingItem(item);
//     setEditName(item.name);
//     setEditDesc(item.description || '');
//     setEditCredit(item.creditWeight || 0);
//     setEditImage(item.imageUrl || '');
//   };

//   const handleCancelEdit = () => {
//     setEditingItem(null);
//   };

//   // --- ฟังก์ชันบันทึกข้อมูล (Mock) ---
//   const handleUpdateSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
    
//     // อัปเดตข้อมูลจำลองในตาราง
//     setItems((prev) => 
//       prev.map(item => 
//         item.itemKey === editingItem.itemKey 
//           ? { ...item, name: editName, description: editDesc, creditWeight: editCredit, imageUrl: editImage } 
//           : item
//       )
//     );
    
//     alert(`อัปเดต ${editingItem.itemKey} สำเร็จ!`);
//     setEditingItem(null);
//   };

//   // --- ฟังก์ชันลบข้อมูล (Mock) ---
//   const handleDeleteClick = () => {
//     if (!editingItem) return;
    
//     const isConfirm = window.confirm(`คุณต้องการลบ "${editingItem.name}" (รหัส: ${editingItem.itemKey}) ใช่หรือไม่? \nการกระทำนี้ไม่สามารถกู้คืนได้`);
    
//     if (isConfirm) {
//       // ลบข้อมูลจำลองออกจากตาราง
//       setItems((prev) => prev.filter((item) => item.itemKey !== editingItem.itemKey));
//       alert(`ลบ ${editingItem.itemKey} เรียบร้อยแล้ว`);
//       setEditingItem(null); 
//     }
//   };

//   return {
//     searchTerm, handleSearchChange,
//     paginatedItems, currentPage, setCurrentPage, totalPages,
//     editingItem,
//     editName, setEditName,
//     editDesc, setEditDesc,
//     editCredit, setEditCredit,
//     editImage, setEditImage,
//     handleEditClick, handleCancelEdit, 
//     handleUpdateSubmit, handleDeleteClick,
    
//     isFetching: false,
//     isUpdating: false,
//     isDeleting: false,
//   };
// }
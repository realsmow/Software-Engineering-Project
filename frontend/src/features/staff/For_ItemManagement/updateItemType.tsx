// //Note: haven't looked over all it yet.
// //Only Standard UI now.

// import React from 'react';
// import { useUpdateItemType } from './Use_updateItemType_ItemManagement';

// export default function ManageItemType() {
//   const {
//     searchTerm, handleSearchChange,
//     paginatedItems, currentPage, setCurrentPage, totalPages,
//     editingItem,
//     editName, setEditName,
//     editDesc, setEditDesc,
//     editCredit, setEditCredit,
//     editImage, setEditImage,
//     handleEditClick, handleCancelEdit, 
//     handleUpdateSubmit, handleDeleteClick,

//     isFetching,
//     isUpdating,
//     isDeleting,
//   } = useUpdateItemType();

//   if (isFetching && !editingItem) {
//     return <div>กำลังโหลดข้อมูล...</div>;
//   }

//   // =========================================================
//   // ส่วนที่ 1: หน้าฟอร์มแก้ไข (เมื่อกดปุ่ม "แก้ไข")
//   // =========================================================
//   if (editingItem) {
//     return (
//       <div>
//         <button onClick={handleCancelEdit} style={{ marginBottom: '15px' }}>
//           ← กลับไปหน้ารายการ
//         </button>
        
//         <h2>แก้ไข Item Type</h2>
//         <p>กำลังแก้ไขรหัส: <strong>{editingItem.itemKey}</strong></p>

//         <form onSubmit={handleUpdateSubmit}>
//           <div>
//             <label>ชื่อสิ่งของ (Name)</label>
//             <input
//               type="text"
//               value={editName}
//               onChange={(e) => setEditName(e.target.value)}
//               maxLength={200}
//             />
//           </div>
//           <div>
//             <label>รายละเอียด (Description)</label>
//             <textarea
//               value={editDesc}
//               onChange={(e) => setEditDesc(e.target.value)}
//               rows={4}
//               maxLength={2000}
//             />
//           </div>
//           <div>
//             <label>น้ำหนักเครดิต (Credit Weight)</label>
//             <input
//               type="number"
//               value={editCredit}
//               onChange={(e) => setEditCredit(Number(e.target.value))}
//               min={0}
//               max={1000}
//             />
//           </div>
//           <div>
//             <label>รูปภาพ (Image URL)</label>
//             <input
//               type="text"
//               value={editImage}
//               onChange={(e) => setEditImage(e.target.value)}
//             />
//           </div>
//           <div>
//             <button 
//               type="submit"
//               disabled={isUpdating || isDeleting}
//             > 
//             บันทึกการเปลี่ยนแปลง 
//             </button>

//             <button type="button" onClick={handleCancelEdit}> ยกเลิก </button>
//             <button type="button" onClick={handleDeleteClick}> ลบข้อมูลนี้ </button>
//           </div>
//         </form>

//       </div>
//     );
//   }

//   // =========================================================
//   // ส่วนที่ 2: หน้าตารางรายการหลัก (ค่าเริ่มต้น)
//   // =========================================================
//   return (
//     <div>
//       <h2>จัดการ Item Type (Update)</h2>
      
//       <div style={{ marginBottom: '20px' }}>
//         <input
//           type="text"
//           placeholder="ค้นหาด้วย Key หรือ Name..."
//           value={searchTerm}
//           onChange={handleSearchChange}
//           style={{ width: '300px', padding: '8px' }}
//         />
//       </div>

//       <table border={1} cellPadding={8} style={{ width: '100%', borderCollapse: 'collapse' }}>
//         <thead>
//           <tr style={{ background: '#f0f0f0' }}>
//             <th>Item Key</th>
//             <th>ชื่อ (Name)</th>
//             <th>รายละเอียดอุปกรณ์</th>
//             <th style={{ width: '100px', textAlign: 'center' }}>จัดการ</th>
//           </tr>
//         </thead>
        
//         <tbody>
//           {paginatedItems.length > 0 ? (
//             paginatedItems.map((item) => (
//               <tr key={item.itemKey}>
//                 <td>{item.itemKey}</td> 
//                 <td>{item.name}</td>
//                 <td>{item.description}</td>
//                 <td style={{ textAlign: 'center' }}>
//                   <button onClick={() => handleEditClick(item)}>แก้ไข</button>
//                 </td>
//               </tr>
              
//             ))
//           ) 
//           : 
//           (
//             <tr>
//               <td colSpan={3} style={{ textAlign: 'center' }}>ไม่พบข้อมูลที่ค้นหา</td>
//             </tr>
//           )
//           }
//         </tbody>
//       </table>

//       {/* ปุ่มกดแบ่งหน้า */}
//       <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
//         <button 
//           onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
//           disabled={currentPage === 1}
//         >
//           ย้อนกลับ
//         </button>
//         <span>หน้า {currentPage} จาก {totalPages}</span>
//         <button 
//           onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
//           disabled={currentPage === totalPages}
//         >
//           ถัดไป
//         </button>
//       </div>
//     </div>
//   );
// }
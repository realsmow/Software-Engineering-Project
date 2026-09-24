// import React from 'react';
// import { useCreateRoom } from './useCreateRoom';

// export default function CreateRoom() {
//   const {
//     manageGroupKey, setManageGroupKey,
//     name, setName,
//     lendable, setLendable,
//     creditWeight, setCreditWeight,
//     description, setDescription,
//     location, setLocation,
//     imageUrl, setImageUrl,
//     capacity, setCapacity,
//     handleSubmit,
//     isCreating
//   } = useCreateRoom();

//   return (
//     <div>
//       <h2>สร้างห้องใหม่ (Create Room)</h2>
//       <p>ระบบจะกำหนดให้ห้องเป็นระดับ T3 โดยอัตโนมัติ</p>

//       <form onSubmit={handleSubmit}>
        
//         {/* กลุ่มที่ดูแล (Manage Group Key) */}
//         <div>
//           <label>กลุ่ม/ภาควิชาที่ดูแล (Manage Group) <span>*</span></label>
//           <input
//             type="number"
//             placeholder="ระบุรหัสกลุ่ม (เช่น 1)"
//             value={manageGroupKey}
//             onChange={(e) => setManageGroupKey(e.target.value === '' ? '' : Number(e.target.value))}
//             required
//             min={1}
//             disabled={isCreating}
//           />
//         </div>

//         {/* ชื่อห้อง */}
//         <div>
//           <label>ชื่อห้อง (Room Name) <span>*</span></label>
//           <input
//             type="text"
//             placeholder="เช่น ห้องประชุม A, ห้อง Lab 302"
//             value={name}
//             onChange={(e) => setName(e.target.value)}
//             required
//             maxLength={200}
//             disabled={isCreating}
//           />
//         </div>

//         {/* ที่ตั้ง */}
//         <div>
//           <label>ที่ตั้ง (Location)</label>
//           <input
//             type="text"
//             placeholder="เช่น ตึกวิศวกรรม ชั้น 3"
//             value={location}
//             onChange={(e) => setLocation(e.target.value)}
//             maxLength={200}
//             disabled={isCreating}
//           />
//         </div>

//         {/* ความจุ (จำนวนที่นั่ง) */}
//         <div>
//           <label>ความจุ (Capacity / Seats)</label>
//           <input
//             type="number"
//             placeholder="จำนวนที่นั่ง (ปล่อยว่างได้ถ้ายืนยันจำนวนไม่ได้)"
//             value={capacity}
//             onChange={(e) => setCapacity(e.target.value === '' ? '' : Number(e.target.value))}
//             min={1}
//             max={10000}
//             disabled={isCreating}
//           />
//         </div>

//         {/* รายละเอียด */}
//         <div>
//           <label>รายละเอียด (Description)</label>
//           <textarea
//             placeholder="อธิบายรายละเอียดเกี่ยวกับห้อง เครื่องมือที่มี ฯลฯ"
//             value={description}
//             onChange={(e) => setDescription(e.target.value)}
//             rows={4}
//             maxLength={2000}
//             disabled={isCreating}
//           />
//         </div>

//         {/* น้ำหนักเครดิต */}
//         <div>
//           <label>เครดิต (Credit Weight) [Default = 0]</label>
//           <input
//             type="number"
//             value={creditWeight}
//             onChange={(e) => setCreditWeight(Number(e.target.value))}
//             min={0}
//             max={1000}
//             disabled={isCreating}
//           />
//         </div>

//         {/* รูปภาพ */}
//         <div>
//           <label>รููปภาพ (Image URL)</label>
//           <input
//             type="text"
//             placeholder="https://..."
//             value={imageUrl}
//             onChange={(e) => setImageUrl(e.target.value)}
//             disabled={isCreating}
//           />
//         </div>

//         {/* อนุญาตให้ยืม */}
//         <div>
//           <label>
//             <input
//               type="checkbox"
//               checked={lendable}
//               onChange={(e) => setLendable(e.target.checked)}
//               disabled={isCreating}
//             />
//             เปิดให้ยืม (Lendable)
//           </label>
//         </div>

//         <div style={{ marginTop: '20px' }}>
//           <button type="submit" disabled={isCreating}>
//             {isCreating ? 'กำลังบันทึก...' : 'บันทึกข้อมูลห้อง'}
//           </button>
//         </div>

//       </form>
//     </div>
//   );
// }
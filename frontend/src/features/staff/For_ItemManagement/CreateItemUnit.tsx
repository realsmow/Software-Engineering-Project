// import React from 'react';
// import { useCreateItemUnit } from './useCreateItemUnit';

// interface Props {
//   itemKey?: string; 
// }

// export default function CreateItemUnit({ itemKey = 'ITEM-XXX' }: Props) {
//   // ดึง Hook มาใช้ และส่ง itemKey เข้าไป
//   const {
//     manageGroupKey, setManageGroupKey,
//     tier, handleTierChange,
//     serialNo, setSerialNo,
//     quantity, setQuantity,
//     prepDays, setPrepDays,
//     lendable, setLendable,
//     imageUrl, setImageUrl,
//     isSerialRequired,
//     handleSubmit,
//     isCreating
//   } = useCreateItemUnit({ itemKey });

//   return (
//     <div>
//       <h2>สร้าง Item Unit</h2>
//       <p>เพิ่มยูนิตให้กับ Item Type ID: <strong>{itemKey}</strong></p>

//       <form onSubmit={handleSubmit}>
        
//         {/* ส่วนที่ 1: บังคับเลือก (Required) */}
//         <div>
//           <label>
//             ภาควิชา/กลุ่มที่ดูแล <span>*</span>
//           </label>
//           <select
//             value={manageGroupKey}
//             onChange={(e) => setManageGroupKey(e.target.value)}
//             required
//             disabled={isCreating}
//           >
//             <option value="" disabled>-- เลือกภาควิชา --</option>
//             <option value="DEPT_COM_SCI">ภาควิชาวิทยาการคอมพิวเตอร์</option>
//             <option value="DEPT_IT">ภาควิชาเทคโนโลยีสารสนเทศ</option>
//             <option value="CENTRAL">ส่วนกลาง</option>
//           </select>
//         </div>

//         <div>
//           <label>
//             ระดับไอเทม (Tier) <span>*</span>
//           </label>
//           <select
//             value={tier}
//             onChange={(e) => handleTierChange(e.target.value)} // เรียกใช้ฟังก์ชันที่แยกไว้ใน Hook
//             required
//             disabled={isCreating}
//           >
//             <option value="" disabled>-- เลือกระดับ --</option>
//             <option value="T0">T0 (ของใช้สิ้นเปลือง / ไม่ต้องมี Serial)</option>
//             <option value="T1">T1 (ของทั่วไป / ต้องมี Serial)</option>
//             <option value="T2">T2 (ของมูลค่าสูง / ต้องมี Serial)</option>
//           </select>
//         </div>

//         <hr />

//         {/* ส่วนที่ 2: Serial และ จำนวน */}
//         <div>
//           <label>
//             หมายเลขซีเรียล (Serial No.) {isSerialRequired && <span>*</span>}
//           </label>
//           <input
//             type="text"
//             placeholder={tier === 'T0' ? 'ระบบจะสร้างให้โดยอัตโนมัติ (ข้ามได้)' : 'ระบุหมายเลขซีเรียล...'}
//             value={serialNo}
//             onChange={(e) => setSerialNo(e.target.value)}
//             required={isSerialRequired}
//             disabled={tier === '' || isCreating}
//             maxLength={100}
//           />
//         </div>

//         <div>
//           <label>จำนวน (Quantity)</label>
//           <input
//             type="number"
//             min={1}
//             max={200}
//             value={quantity}
//             onChange={(e) => setQuantity(Number(e.target.value))}
//             disabled={isCreating}
//           />
//         </div>

//         {/* ส่วนที่ 3: การตั้งค่าเพิ่มเติม (มี Default) */}
//         <div>
//           <label>เวลาเตรียมของ (Prep Days)</label>
//           <input
//             type="number"
//             min={0}
//             max={30}
//             value={prepDays}
//             onChange={(e) => setPrepDays(Number(e.target.value))}
//             disabled={isCreating}
//           />
//         </div>

//         <div>
//           <label>
//             <input
//               type="checkbox"
//               checked={lendable}
//               onChange={(e) => setLendable(e.target.checked)}
//               disabled={isCreating}
//             />
//             อนุญาตให้ยืมได้ทันที (Lendable)
//           </label>
//         </div>

//         {/* ส่วนที่ 4: รูปภาพเฉพาะยูนิต (Optional) */}
//         <div>
//           <label>รูปภาพเฉพาะยูนิต (Image URL - ถ้ามี)</label>
//           <input
//             type="text"
//             placeholder="https://..."
//             value={imageUrl}
//             onChange={(e) => setImageUrl(e.target.value)}
//             disabled={isCreating}
//           />
//         </div>

//         <div>
//           <button type="submit" disabled={isCreating}>
//             {isCreating ? 'กำลังบันทึก...' : 'บันทึก Item Unit'}
//           </button>
//         </div>
        
//       </form>
//     </div>
//   );
// }
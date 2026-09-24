// import React from 'react';
// import { useCreateItemType } from './useCreateItemType'; // import hook เข้ามา

// export default function CreateItemType() {
//   const {
//     name,
//     setName,
//     description,
//     setDescription,
//     imageUrl,
//     setImageUrl,
//     creditWeight,
//     setCreditWeight,
//     handleSubmit,
//     isCreating
//   } = useCreateItemType();

//   return (
//     <div>
//       <h2>สร้าง Item Type (หมวดหมู่/แคตตาล็อกหลัก)</h2>
//       <p>ข้อมูลส่วนนี้จะเป็นข้อมูลกลางที่ใช้ร่วมกันในทุกๆ ยูนิต</p>

//       <form onSubmit={handleSubmit}>
        
//         {/* Name */}
//         <div>
//           <label>
//             ชื่อสิ่งของ (Name) <span>*</span>
//           </label>
//           <input
//             type="text"
//             placeholder="เช่น iPad Pro 11-inch, กล้อง Sony A7IV"
//             value={name}
//             onChange={(e) => setName(e.target.value)}
//             required
//             maxLength={100}
//             disabled={isCreating}
//           />
//         </div>

//         {/* Description */}
//         <div>
//           <label>รายละเอียด (Description)</label>
//           <textarea
//             placeholder="อธิบายสเปคหรือรายละเอียดของสิ่งของ..."
//             value={description}
//             onChange={(e) => setDescription(e.target.value)}
//             rows={4}
//             maxLength={2000}
//             disabled={isCreating}
//           />
//         </div>

//         {/* Credit */}
//         <div>
//           <label>น้ำหนักเครดิต (Credit Weight)</label>
//           <input
//             type="number"
//             min={0}
//             value={creditWeight}
//             onChange={(e) => setCreditWeight(Number(e.target.value))}
//             required
//             disabled={isCreating}
//           />
//         </div>

//         {/* Picture */}
//         <div>
//           <label>รูปภาพหลัก (Image URL)</label>
//           <input
//             type="text"
//             placeholder="https://..."
//             value={imageUrl}
//             onChange={(e) => setImageUrl(e.target.value)}
//             disabled={isCreating}
//           />
//         </div>

//         {/* ปุ่ม Submit */}
//         <div>
//           <button type="submit" disabled={isCreating}>
//             {isCreating ? 'กำลังบันทึก...' : 'บันทึก Item Type'}
//           </button>
//         </div>
        
//       </form>
//     </div>
//   );
// }
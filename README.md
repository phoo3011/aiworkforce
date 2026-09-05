# AI Workforce

เว็บไซต์ประชาสัมพันธ์และพื้นที่เรียนสำหรับโครงการ AI Workforce ประกอบด้วย frontend แบบ static,
Firebase Authentication และ Express/SQLite API สำหรับตรวจสิทธิ์รายหลักสูตร

## โครงสร้าง

- `aiworkforce/` — เว็บไซต์ประชาสัมพันธ์ หน้า Dashboard และหน้าบทเรียน
- `aiworkforce-backend/` — API, ฐานข้อมูล, เครื่องมือนำเข้าผู้เรียนและเนื้อหา

## เริ่มต้นใช้งานในเครื่อง

ต้องมี Node.js และไฟล์ Firebase Admin service account ที่
`aiworkforce-backend/serviceAccountKey.json` ไฟล์นี้ถูก `.gitignore` และห้าม commit

ติดตั้งและเริ่ม backend:

```powershell
cd aiworkforce-backend
npm install
npm run seed
npm start
```

`npm run seed` จะอ่านรายชื่อเดิมจาก `aiworkforce-backend/students.csv` หากไฟล์มีอยู่
ไฟล์นี้เป็นข้อมูลส่วนตัวและถูก ignore ไว้ จึงไม่ถูกส่งขึ้น Git รายชื่อจะถูกเพิ่มเป็นผู้ชำระแล้ว
แต่จะยังไม่ถูกผูกกับหลักสูตรใด

เปิด frontend ด้วย static server ที่ port 5500 เช่น Live Server แล้วเปิด
`http://localhost:5500/aiworkforce/`

การตั้งค่า environment, Firebase credential และไฟล์ข้อมูล private จะส่งให้ผู้ดูแลระบบแยกต่างหาก
และไม่เก็บไว้ใน repository นี้

## นำเข้าสิทธิ์รายหลักสูตร

เมื่อได้รับไฟล์สิทธิ์รายหลักสูตรจากผู้ดูแล ให้รัน:

```powershell
npm run import:enrollments -- enrollments.csv
```

ไฟล์จริงถูก ignore และจะไม่ถูก commit ระบบจะไม่กำหนดสิทธิ์ให้รายชื่อเดิมอัตโนมัติ

## นำเข้าบทเรียนและ checkpoint

เมื่อได้รับไฟล์ข้อมูลบทเรียนที่มี YouTube video ID, Google Form URL และเวลาของกิจกรรม ให้รัน:

```powershell
npm run import:content -- course-content.json
```

ชนิด checkpoint ที่รองรับ:

- `pre_test` — แสดงก่อนเริ่มเรียน
- `exercise` — แนะนำช่วงเวลาในวิดีโอผ่าน `triggerAtSeconds` และเปิดทำได้ตลอดเวลา
- `post_test` — เปิดเมื่อวิดีโอเล่นถึงตอนจบ

Google Forms ยังไม่ส่งผลคะแนนกลับมาที่เว็บไซต์ใน MVP นี้

## Production configuration

Frontend อ่าน API URL จาก `aiworkforce/site-config.js` ค่า production เริ่มต้นคือ
`https://api.aiworkforcedev.online` ต้องเปลี่ยนให้ตรงกับ backend hosting จริงก่อน deploy

ควรกำหนด `ALLOWED_ORIGINS` เฉพาะโดเมนจริง และเก็บ Firebase credential ใน secret manager
ของ hosting provider

## ทดสอบ

```powershell
cd aiworkforce-backend
npm test
```

ชุดทดสอบใช้ SQLite ในหน่วยความจำ จึงไม่แก้ฐานข้อมูลจริง

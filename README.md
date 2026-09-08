# AI Workforce

เว็บไซต์ประชาสัมพันธ์และพื้นที่เรียนสำหรับโครงการ AI Workforce ประกอบด้วย frontend แบบ static,
Firebase Authentication และ Express/SQLite API สำหรับตรวจสิทธิ์ผู้เรียนทั้งแพลตฟอร์ม

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
ไฟล์นี้เป็นข้อมูลส่วนตัวและถูก ignore ไว้ จึงไม่ถูกส่งขึ้น Git รายชื่อจะถูกเพิ่มหรือเปิดใช้งานเป็นผู้เรียน
และเข้าถึงได้ทุกหลักสูตรที่เปิดใช้งาน

เปิด frontend ด้วย static server ที่ port 5500 เช่น Live Server แล้วเปิด
`http://localhost:5500/aiworkforce/`

การตั้งค่า environment, Firebase credential และไฟล์ข้อมูล private จะส่งให้ผู้ดูแลระบบแยกต่างหาก
และไม่เก็บไว้ใน repository นี้

## นำเข้าบทเรียนและ checkpoint

เมื่อได้รับไฟล์ข้อมูลบทเรียนที่มี YouTube video ID, ลิงก์สไลด์ Google Drive, Google Form URL และเวลาของกิจกรรม ให้รัน:

```powershell
npm run import:content -- course-content.json
```

ชนิด checkpoint ที่รองรับ:

- `pre_test` — แสดงก่อนเริ่มเรียน
- `exercise` — แนะนำช่วงเวลาในวิดีโอผ่าน `triggerAtSeconds` และเปิดทำได้ตลอดเวลา
- `post_test` — เปิดเมื่อวิดีโอเล่นถึงตอนจบ

Google Forms ยังไม่ส่งผลคะแนนกลับมาที่เว็บไซต์ใน MVP นี้

บทเรียนหนึ่งบทต้องมีวิดีโอหรือเอกสารอย่างน้อยหนึ่งรายการ และสามารถใส่สไลด์หลายไฟล์ได้:

```json
{
  "title": "ชื่อบทเรียน",
  "order": 1,
  "youtubeVideoId": "optional-video-id",
  "materials": [
    {
      "title": "สไลด์ประกอบการเรียน",
      "url": "https://drive.google.com/file/d/.../view"
    }
  ]
}
```

ลิงก์เอกสารอยู่ใน `course-content.json` ซึ่งเป็นไฟล์ private ที่ถูก ignore และหน้าเรียนจะแสดง
เฉพาะหลังผู้เรียนผ่านการเข้าสู่ระบบแล้ว ไฟล์จริงควรอยู่ใน Google Drive แบบ Restricted ตามสิทธิ์ที่ผู้ดูแลกำหนด

## Production configuration

Frontend อ่าน API URL จาก `aiworkforce/site-config.js` ค่า production เริ่มต้นคือ
`https://api.aiworkforcedev.online` ต้องเปลี่ยนให้ตรงกับ backend hosting จริงก่อน deploy

ควรกำหนด `ALLOWED_ORIGINS` เฉพาะโดเมนจริง และเก็บ Firebase credential ใน secret manager
ของ hosting provider

## Deploy backend ก่อนเชื่อมโดเมน

มี Docker configuration ใน `aiworkforce-backend/` สำหรับนำ API ขึ้น server ร่วมกับบริการอื่น
โดย API จะฟังเฉพาะ `127.0.0.1:5002` จึงยังไม่เปิดสู่สาธารณะจนกว่า Nginx และ DNS ของโดเมนจริง
จะพร้อม

บน server ให้เก็บ Firebase Admin service account นอก repository แล้วคัดลอกไฟล์ตัวอย่าง:

```bash
cd /opt/aiworkforce/app/aiworkforce-backend
cp deploy.env.example deploy.env
mkdir -p /opt/aiworkforce/secrets
chmod 700 /opt/aiworkforce/secrets
chmod 600 /opt/aiworkforce/secrets/firebase-service-account.json
docker compose --env-file deploy.env up -d --build
curl http://127.0.0.1:5002/api/health
```

ห้ามใส่ Firebase service-account JSON, `deploy.env`, SQLite database, รายชื่อผู้เรียน หรือไฟล์เนื้อหา
ลง Git เมื่อผู้ดูแลสาขาให้ชื่อ API domain แล้ว จึงเพิ่ม Nginx virtual host, ออก HTTPS certificate
และเปลี่ยน `ALLOWED_ORIGINS` กับ `aiworkforce/site-config.js` ให้ตรงกับชื่อจริง
## ทดสอบ

```powershell
cd aiworkforce-backend
npm test
```

ชุดทดสอบใช้ SQLite ในหน่วยความจำ จึงไม่แก้ฐานข้อมูลจริง

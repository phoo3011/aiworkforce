const fs = require('fs');
const path = require('path');

const { initializeDatabase, openDatabase } = require('./database');

function readStudentEmails() {
  const configuredPath = process.env.STUDENT_SEED_PATH;
  const studentFilePath = configuredPath
    ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(__dirname, configuredPath))
    : path.resolve(__dirname, 'students.csv');

  if (!fs.existsSync(studentFilePath)) return [];

  return [...new Set(fs.readFileSync(studentFilePath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && line !== 'email' && line.includes('@')))];
}

const TRACK_MAP = {
  'supreecha.j@pdkm.tech': 'dt',
  'sirinapaphan.thiti@gmail.com': 'ml',
  'haritkwstk14@gmail.com': 'dl',
  'kitiew.iew@gmail.com': 'ml',
  'kchxppxn.nn@gmail.com': 'dl',
  'biwmlg43205@gmail.com': 'dl',
  'pantharee.saang@gmail.com': 'dl',
  'pisut@cyber-guard.co.th': 'dl',
  'amonwan4641@gmail.com': 'ml',
  'chanakunpoonsiri@gmail.com': 'ml',
  'surapas3022@gmail.com': 'dl',
  'swich@officedesign.co.th': 'dl',
  'phattharaphon@officedesign.co.th': 'dl',
  'watcharapong.h@beneat.co': 'ml',
  'kh.phuwich@gmail.com': 'ml',
  'subphuwich@gmail.com': 'ml',
  'patompoltsj@gmail.com': 'dt',
  'witthawat_siri@hotmail.com': 'dl',
  'gustgtx2@gmail.com': 'dl',
  'maxntp24682@gmail.com': 'dl',
  'theethawat.cha@gmail.com': 'dl',
  'phurin.cps@gmail.com': 'ml',
  'hongkung4826@gmail.com': 'ml',
  'poiisom.sp@gmail.com': 'ml',
  'nattkpk@gmail.com': 'dl',
  'unchanakheawon@gmail.com': 'ml',
  'siwanan@officedesign.co.th': 'dt',
  'chitapolzone@gmail.com': 'dl',
  'jtkpbmbb5453@gmail.com': 'ml',
  'topoohyou@gmail.com': 'ml',
  'manuiopface@gmail.com': 'ml',
  's.thananarin@gmail.com': 'ml',
  'pangpond4343@gmail.com': 'ml',
  '692110199@gmail.com': 'dl',
  'natakronmiku@gmail.com': 'dl',
  'ponprom2006@gmail.com': 'ml',
  'nut@edu.rmutl.ac.th': 'dl',
  'anugul.smp@gmail.com': 'dt',
  'thanajade.d@gmail.com': 'ml',
  'pan.godchagorn2548@gmail.com': 'dl',
  'nicetywin2548@gmail.com': 'dl',
  'i.ampeba55@gmail.com': 'dl',
  'xirconsss@gmail.com': 'dl',
  'phattharasuda.thepsatra@gmail.com': 'dl',
  'kanyapak.ngam@gmail.com': 'ml',
  'kanokkan2233@gmail.com': 'ml',
  'phooriwat3011@gmail.com': 'all',
  'turnpro.admin@gmail.com': 'all',
  'turnpro.contact@gmail.com': 'all',
  'sarocha.wir@gmail.com': 'all',
  'petchee@gmail.com': 'all',
  'waranya@camt.info': 'all',
  'tama.d@camt.info': 'all',
  'noppachai.w@camt.info': 'all',
  'pimwilai.ph@gmail.com': 'all',
  'naong69@gmail.com': 'all',
  'poom2425@gmail.com': 'all',
  'smartwattana@gmail.com': 'all',
  'thepchai@gmail.com': 'all',
  'mingrath@gmail.com': 'all',
  'ajanrach@gmail.com': 'all',
  'peerachet.porkaew@gmail.com': 'all',
  'ishop.is622@gmail.com': 'all',
  'martnarabodee@gmail.com': 'all',
  'purinut1986@gmail.com': 'all',
  'watin15883@gmail.com': 'all',
  'zero.ovite@gmail.com': 'all',
  'folk.sawit@gmail.com': 'all',
  'kraiyos.wanna@gmail.com': 'all',
  'pagonpaka@gmail.com': 'all',
  'nongnuchketui@gmail.com': 'all'
};

async function seed() {
  const database = await openDatabase();

  try {
    await initializeDatabase(database);
    const emails = readStudentEmails();
    const allEmails = new Set([...emails, ...Object.keys(TRACK_MAP)]);

    for (const email of allEmails) {
      const track = TRACK_MAP[email] || 'all';
      const existing = await database.get('SELECT id FROM students WHERE LOWER(email) = ?', [email]);
      if (existing) {
        await database.run(
          "UPDATE students SET status = 'active', track = ? WHERE id = ?",
          [track, existing.id]
        );
      } else {
        await database.run(
          "INSERT INTO students (email, status, track) VALUES (?, 'active', ?)",
          [email, track]
        );
      }
    }

    const studentCount = await database.get('SELECT COUNT(*) AS count FROM students');
    const courseCount = await database.get('SELECT COUNT(*) AS count FROM courses');

    console.log('Database structure is ready.');
    console.log(`Students loaded from private CSV: ${emails.length}`);
    console.log(`Existing students preserved: ${studentCount.count}`);
    console.log(`Courses available: ${courseCount.count}`);
    console.log('Active students can access every active course.');
  } finally {
    await database.close();
  }
}

seed().catch((error) => {
  console.error('Unable to initialize database:', error.message);
  process.exit(1);
});

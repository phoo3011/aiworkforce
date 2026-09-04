const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to the database
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// List of authorized emails
const emails = [
  "phooriwat3011@gmail.com", // Your email
  "supreecha.j@pdkm.tech",
  "Sirinapaphan.thiti@gmail.com",
  "haritkwstk14@gmail.com",
  "kitiew.iew@gmail.com",
  "kchxppxn.nn@gmail.com",
  "biwmlg43205@gmail.com",
  "Pantharee.saang@gmail.com",
  "pisut@cyber-guard.co.th",
  "amonwan4641@gmail.com",
  "chanakunpoonsiri@gmail.com",
  "surapas3022@gmail.com",
  "swich@officedesign.co.th",
  "phattharaphon@officedesign.co.th",
  "watcharapong.h@beneat.co",
  "kh.phuwich@gmail.com",
  "subphuwich@gmail.com",
  "patompoltsj@gmail.com",
  "witthawat_siri@hotmail.com",
  "gustgtx2@gmail.com",
  "maxntp24682@gmail.com",
  "theethawat.cha@gmail.com",
  "Phurin.cps@gmail.com",
  "hongkung4826@gmail.com",
  "poiisom.sp@gmail.com",
  "natakronmiku@gmail.com",
  "nattkpk@gmail.com",
  "unchanakheawon@gmail.com",
  "siwanan@officedesign.co.th",
  "Chitapolzone@gmail.com",
  "jtkpbmbb5453@gmail.com",
  "topoohyou@gmail.com",
  "manuiopface@gmail.com",
  "s.thananarin@gmail.com",
  "pangpond4343@gmail.com",
  "692110199@gmail.com",
  "ponprom2006@gmail.com",
  "nut@edu.rmutl.ac.th",
  "Anugul.smp@gmail.com",
  "thanajade.d@gmail.com",
  "pan.godchagorn2548@gmail.com",
  "nicetywin2548@gmail.com",
  "i.ampeba55@gmail.com",
  "xirconsss@gmail.com",
  "phattharasuda.thepsatra@gmail.com",
  "kanyapak.ngam@gmail.com",
  "kanokkan2233@gmail.com",
  "turnpro.admin@gmail.com",
  "turnpro.contact@gmail.com",
  "sarocha.wir@gmail.com",
  "petchee@gmail.com",
  "waranya@camt.info",
  "tama.d@camt.info",
  "noppachai.w@camt.info",
  "pimwilai.ph@gmail.com",
  "naong69@gmail.com",
  "poom2425@gmail.com",
  "smartwattana@gmail.com",
  "thepchai@gmail.com",
  "mingrath@gmail.com",
  "ajanrach@gmail.com",
  "Peerachet.porkaew@gmail.com",
  "ishop.is622@gmail.com",
  "martnarabodee@gmail.com",
  "Purinut1986@gmail.com",
  "watin15883@gmail.com",
  "zero.ovite@gmail.com",
  "folk.sawit@gmail.com",
  "kraiyos.wanna@gmail.com",
  "pagonpaka@gmail.com",
  "nongnuchketui@gmail.com"
];

// Clean duplicates
const uniqueEmails = [...new Set(emails)];

console.log('Seeding database with authorized emails...');

db.serialize(() => {
  // Ensure table exists just in case it is a completely fresh run
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    is_paid INTEGER DEFAULT 0
  )`);

  const stmt = db.prepare("INSERT OR IGNORE INTO students (email, is_paid) VALUES (?, 1)");
  
  uniqueEmails.forEach(email => {
    stmt.run(email);
  });
  
  stmt.finalize(() => {
    console.log(`✅ Successfully seeded ${uniqueEmails.length} unique emails into the database.`);
    db.close();
  });
});

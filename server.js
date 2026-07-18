const express = require("express");
const cron = require("node-cron");
const path = require("path");
const mysql = require("mysql2"); 
const { Client, RemoteAuth } = require("whatsapp-web.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🛢️ MySQL डेटाबेस कनेक्शन
const db = mysql.createPool({
  host: "mysql-3a8a9382-yash721950-fa6f.b.aivencloud.com",      
  port: 27814,
  user: "avnadmin",           
  password: process.env.DB_PASSWORD, 
  database: "defaultdb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// 🛠️ कस्टम डेटाबेस सेशन स्टोअर
const MySQLStore = {
  sessionExists: async (options) => {
    return new Promise((resolve) => {
      db.query("SELECT 1 FROM wa_sessions WHERE session_id = ?", [options.session], (err, rows) => {
        resolve(!err && rows && rows.length > 0);
      });
    });
  },
  save: async (options) => {
    return new Promise((resolve) => {
      const dataStr = JSON.stringify(options.data);
      db.query(
        "INSERT INTO wa_sessions (session_id, data) VALUES (?, ?) ON DUPLICATE KEY UPDATE data = ?",
        [options.session, dataStr, dataStr],
        () => resolve()
      );
    });
  },
  extract: async (options) => {
    return new Promise((resolve) => {
      db.query("SELECT data FROM wa_sessions WHERE session_id = ?", [options.session], (err, rows) => {
        if (!err && rows && rows.length > 0) {
          try { resolve(JSON.parse(rows[0].data)); } catch(e) { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });
  },
  delete: async (options) => {
    return new Promise((resolve) => {
      db.query("DELETE FROM wa_sessions WHERE session_id = ?", [options.session], () => resolve());
    });
  }
};

// 🟢 WhatsApp Client Setup
const client = new Client({
  authStrategy: new RemoteAuth({
    clientId: "bca_bot_session",
    store: MySQLStore,
    backupSyncIntervalMs: 60000
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: { 
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable', 
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ] 
  }
});

// 📲 सुरक्षित Pairing Code जनरेशन (१० सेकंदाचा डिले)
let pairingCodeRequested = false;
client.on("qr", async (qr) => {
  if (pairingCodeRequested) return;
  pairingCodeRequested = true;

  console.log("---------------------------------------------------------");
  console.log("⏳ व्हॉट्सॲप सर्व्हरशी जोडणी होत आहे, १० सेकंद थांबा...");
  console.log("---------------------------------------------------------");
  
  await new Promise(resolve => setTimeout(resolve, 10000));

  try {
    const myPhoneNumber = "917219502467"; 
    const pairingCode = await client.requestPairingCode(myPhoneNumber);
    console.log("\n=================================================");
    console.log("🔥 तुझा WHATSAPP PAIRING CODE: ", pairingCode);
    console.log("=================================================\n");
  } catch (err) {
    console.error("❌ Pairing Code Error (Retrying):", err.message);
    pairingCodeRequested = false; 
  }
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot यशस्वीरित्या कनेक्ट झाला आहे आणि रेडी आहे! 🚀");
});

client.on('remote_auth_success', () => {
  console.log('💾 लॉगिन सेशन डेटाबेसमध्ये सुरक्षित सेव्ह झालं!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication फेल झालं:', msg);
  pairingCodeRequested = false;
});

client.on('disconnected', (reason) => {
  console.log('❌ WhatsApp डिसकनेक्ट झालं! पुन्हा कनेक्ट करत आहे...', reason);
  pairingCodeRequested = false;
  client.initialize();
});

client.initialize();

// डेटाबेस टेबल्स सेटअप
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL डेटाबेस कनेक्शन फेल:", err.message);
  } else {
    console.log("✅ MySQL डेटाबेस यशस्वीरित्या कनेक्ट झाला! 🛢️");
    
    const createSessionTable = `
      CREATE TABLE IF NOT EXISTS wa_sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;
    
    const createStudentsTable = `
      CREATE TABLE IF NOT EXISTS bca_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        enroll_no VARCHAR(50) UNIQUE NOT NULL,
        sem VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    connection.query(createSessionTable, () => {
      connection.query(createStudentsTable, () => {
        connection.release();
      });
    });
  }
});

let sentAlertsLog = {}; 
const timetable = {
  MON: [
    { start: "10:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "11:00", subject: "Lab on Ecommerce", teacher: "Dr. Shailesh R. Thakare" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh" },
    { start: "13:45", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator" },
    { start: "16:00", subject: "Library", teacher: "Library Staff" },
  ],
  TUE: [
    { start: "10:00", subject: "Management Information System", teacher: "Dr. Shailesh R. Thakare" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar" },
    { start: "12:45", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "13:45", subject: "Lab on Modern Operating System", teacher: "Dr. Sonali Nimbhorkar" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator" },
    { start: "16:00", subject: "Library", teacher: "Library Staff" },
  ],
  WED: [
    { start: "10:00", subject: "Lab on Computer Graphics", teacher: "Dr. Vaibhav V. Thakare" },
    { start: "11:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh" },
    { start: "13:45", subject: "Aptitude", teacher: "Sachin J. Deshpande" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More" },
    { start: "16:00", subject: "Physical Education", teacher: "Dr. Amar More" },
  ],
  THU: [
    { start: "10:00", subject: "Management Information System", teacher: "Dr. Shailesh R. Thakare" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar" },
    { start: "12:45", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar" },
    { start: "13:45", subject: "Communication Skill", teacher: "Prof. Ashwini Rathi" },
    { start: "15:00", subject: "Lab on Modern Operating System", teacher: "Dr. Sonali Nimbhorkar" },
    { start: "16:00", subject: "Lab on Computer Graphics", teacher: "Dr. Vaibhav V. Thakare" },
  ],
  FRI: [
    { start: "10:00", subject: "Communication Skill", teacher: "Prof. Ashwini Rathi" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar" },
    { start: "12:45", subject: "Lab on Ecommerce", teacher: "Dr. Shailesh R. Thakare" },
    { start: "13:45", subject: "Advance Excel", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More" },
    { start: "16:00", subject: "Physical Education", teacher: "Dr. Amar More" },
  ],
};

const allowedEnrollments = [];
for (let i = 1; i <= 80; i++) {
  const paddedNumber = String(i).padStart(4, '0');
  allowedEnrollments.push(`GHRUA2501114${paddedNumber}`);
}

function sendWhatsAppAlert(phoneNumber, messageText) {
  const formattedNumber = `${phoneNumber}@c.us`; 
  client.sendMessage(formattedNumber, messageText)
    .then(() => console.log(`📩 WhatsApp मेसेज ${phoneNumber} ला पाठवला!`))
    .catch((err) => console.error(`❌ WhatsApp Send Error for ${phoneNumber}:`, err.message));
}

app.post("/api/subscribe", (req, res) => {
  const { phone, name, enroll_no, sem } = req.body;
  if (!phone || !name || !enroll_no || !sem) return res.status(400).send("Please fill all fields.");
  
  const studentEnroll = String(enroll_no).trim().toUpperCase(); 
  if (!allowedEnrollments.includes(studentEnroll)) return res.status(403).send("Access Denied.");

  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  if (cleanPhone.length === 10) {
    const checkSql = "SELECT * FROM bca_students WHERE phone = ? OR enroll_no = ?";
    db.query(checkSql, [cleanPhone, studentEnroll], (checkErr, results) => {
      if (checkErr) return res.status(500).send("Database Error.");
      if (results.length > 0) return res.status(409).send("Already Registered.");

      const sql = "INSERT INTO bca_students (phone, name, enroll_no, sem) VALUES (?, ?, ?, ?)";
      db.query(sql, [cleanPhone, name, studentEnroll, sem], (err) => {
        if (err) return res.status(500).send("Database Error.");
        
        const welcomeMessage = `🎉 *Registration Successful!*\n\nHi ${name},\nYour registration on *BCA Alerts* portal is successful! 🎓`;
        sendWhatsAppAlert(cleanPhone, welcomeMessage);
        res.sendStatus(200);
      });
    });
  } else {
    res.status(400).send("Invalid Phone Number.");
  }
});

cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[nowInIndia.getDay()];
  const currentHours = String(nowInIndia.getHours()).padStart(2, '0');
  const currentMinutes = String(nowInIndia.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  if (currentDay === "SAT" || currentDay === "SUN") {
    if (currentTimeStr === "11:10") {
      const holidayKey = `${currentDay}-holiday-1110`;
      if (!sentAlertsLog[holidayKey]) {
        db.query("SELECT phone FROM bca_students", (err, results) => {
          if (err || results.length === 0) return;
          results.forEach(row => {
            sendWhatsAppAlert(row.phone, "😎 *BCA Alerts*:\n\nIt's your holiday! Enjoy your day! 🎉");
          });
        });
        sentAlertsLog[holidayKey] = true;
      }
    }
    return; 
  }

  const currentSchedule = timetable[currentDay] || [];
  const upcomingLecture = currentSchedule.find((l) => {
    const [lHours, lMinutes] = l.start.split(":");
    const lectureTime = new Date(nowInIndia);
    lectureTime.setHours(parseInt(lHours), parseInt(lMinutes), 0, 0);
    const diffInMinutes = (lectureTime - nowInIndia) / (1000 * 60);
    return diffInMinutes > 5 && diffInMinutes <= 10;
  });

  if (upcomingLecture) {
    const alertKey = `${currentDay}-${upcomingLecture.start}`;
    if (!sentAlertsLog[alertKey]) {
      db.query("SELECT phone FROM bca_students", (err, results) => {
        if (err || results.length === 0) return;
        results.forEach(row => {
          const alertMessage = `📢 *BCA Class Alert* 🎓\n\n📚 *Subject:* ${upcomingLecture.subject}\n👨‍🏫 *Teacher:* ${upcomingLecture.teacher}\n⏰ *Time:* ${upcomingLecture.start}`;
          sendWhatsAppAlert(row.phone, alertMessage);
        });
      });
      sentAlertsLog[alertKey] = true;
    }
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Website engine online at port ${PORT}`));

const express = require("express");
const cron = require("node-cron");
const path = require("path");
const mysql = require("mysql2"); 
const { Client, LocalAuth } = require("whatsapp-web.js"); // इथे LocalAuth केला

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🛢️ MySQL डेटाबेस कनेक्शन
const dbConfig = {
  host: "mysql-3a8a9382-yash721950-fa6f.b.aivencloud.com",      
  port: 27814,
  user: "avnadmin",           
  password: process.env.DB_PASSWORD, 
  database: "defaultdb",
  ssl: { rejectUnauthorized: false }
};

let db;
function handleDisconnect() {
  db = mysql.createConnection(dbConfig);
  db.connect((err) => {
    if (err) {
      console.error("❌ MySQL डेटाबेस कनेक्शन फेल, पुन्हा प्रयत्न करत आहे...:", err.message);
      setTimeout(handleDisconnect, 2000);
    } else {
      console.log("✅ MySQL डेटाबेस यशस्वीरित्या कनेक्ट झाला! 🛢️");
      setupTables();
    }
  });
  db.on("error", (err) => {
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handleDisconnect();
    } else {
      throw err;
    }
  });
}
handleDisconnect();

function setupTables() {
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
  db.query(createStudentsTable, () => {});
}

let isBotReady = false;
let currentQrUrl = null;

// 🟢 WhatsApp Client Setup (LocalAuth सह रेंडर फ्रेंडली)
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, ".wwebjs_auth") // रेंडरवर लोकल फोल्डरमध्ये सेशन सेव्ह होणार
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

// QR कोड इव्हेंट
client.on("qr", (qr) => {
  console.log("📸 नवीन QR कोड जनरेट झाला आहे!");
  currentQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
});

// 🌐 QR कोड पाहण्यासाठी स्पेशल लिंक
app.get("/qr", (req, res) => {
  if (isBotReady) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: green;">✅ WhatsApp Bot यशस्वीरित्या कनेक्टेड आहे!</h2>
        <p>आता स्कॅन करायची गरज नाही, बॉट चालू आहे भावा! 😎</p>
      </div>
    `);
  } else if (currentQrUrl) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>📸 BCA Alert Bot - WhatsApp Login</h2>
        <p>तुझ्या मोबाईलच्या WhatsApp > Linked Devices मध्ये जाऊन हा QR कोड स्कॅन कर भावा:</p>
        <div style="margin: 20px auto; padding: 20px; border: 2px dashed #075E54; display: inline-block; background: #f9f9f9; border-radius: 10px;">
          <img src="${currentQrUrl}" alt="WhatsApp QR Code" style="width: 300px; height: 300px;" />
        </div>
        <p style="color: #666;">💡 टीप: ही लिंक दुसऱ्या फोनवर/लॅपटॉपवर उघडून स्वतःच्या फोनने QR स्कॅन कर.</p>
      </div>
    `);
  } else {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>⏳ कृपया ३० सेकंद थांबा...</h2>
        <p>सर्व्हर सुरू होत आहे आणि QR कोड जनरेट करत आहे... पेज थोड्या वेळाने रिफ्रेश कर भावा.</p>
      </div>
    `);
  }
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot यशस्वीरित्या कनेक्ट झाला आहे आणि रेडी आहे! 🚀");
  isBotReady = true;
  currentQrUrl = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication फेल झालं:', msg);
  isBotReady = false;
});

client.on('disconnected', (reason) => {
  console.log('❌ WhatsApp डिसकनेक्ट झालं! पुन्हा कनेक्ट करत आहे...', reason);
  isBotReady = false;
  setTimeout(() => { client.initialize(); }, 5000);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception रोखली:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection रोखली:', reason);
});

client.initialize();

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
  if (!isBotReady) return;
  const formattedNumber = `${phoneNumber}@c.us`; 
  client.sendMessage(formattedNumber, messageText)
    .then(() => console.log(`📩 WhatsApp मेसेज ${phoneNumber} ला पाठवला!`))
    .catch((err) => console.error(`❌ WhatsApp Send Error:`, err.message));
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
  if (!isBotReady) return;

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

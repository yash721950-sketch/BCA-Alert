const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const express = require("express");
const cron = require("node-cron");
const path = require("path");
const mysql = require("mysql2");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🛢️ MySQL डेटाबेस कनेक्शन (Aiven Cloud)
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
      console.error("❌ MySQL डेटाबेस कनेक्शन फेल:", err.message);
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

let sock;
let isBotReady = false;
let currentQrDataUrl = null;

// 🟢 Baileys WhatsApp Connection Function
async function connectToWhatsApp() {
  // लोकल फोल्डरमध्ये सेशन डेटा साठवला जाईल
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, "auth_info_baileys"));

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📸 नवीन Baileys QR कोड जनरेट झाला आहे!");
      currentQrDataUrl = await QRCode.toDataURL(qr);
    }

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("❌ व्हॉट्सॲप डिसकनेक्ट झाले. पुन्हा प्रयत्न करत आहे...", shouldReconnect);
      isBotReady = false;
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp Bot (Baileys) यशस्वीरित्या कनेक्ट झाला आहे आणि रेडी आहे! 🚀");
      isBotReady = true;
      currentQrDataUrl = null;
    }
  });
}

connectToWhatsApp();

// 🌐 QR कोड पाहण्यासाठी वेब पेज
app.get("/qr", (req, res) => {
  if (isBotReady) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: green;">✅ WhatsApp Bot यशस्वीरित्या कनेक्टेड आहे! (Baileys Engine)</h2>
        <p>बॉट बॅकग्राउंडला सुसाट चालू आहे भावा! 😎</p>
      </div>
    `);
  } else if (currentQrDataUrl) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>📸 BCA Alert Bot - Baileys QR Login</h2>
        <p>तुझ्या मोबाईलच्या WhatsApp > Linked Devices मध्ये जाऊन हा QR कोड स्कॅन कर भावा:</p>
        <div style="margin: 20px auto; padding: 20px; border: 2px dashed #075E54; display: inline-block; background: #f9f9f9; border-radius: 10px;">
          <img src="${currentQrDataUrl}" alt="WhatsApp QR Code" style="width: 300px; height: 300px;" />
        </div>
      </div>
    `);
  } else {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>⏳ कृपया १० सेकंद थांबा...</h2>
        <p>Baileys इंजिन सुरू होत आहे आणि QR कोड जनरेट करत आहे... पेज रिफ्रेश कर भावा.</p>
      </div>
    `);
  }
});

// 📩 मेसेज पाठवण्याचे फंक्शन
async function sendWhatsAppAlert(phoneNumber, messageText) {
  if (!isBotReady || !sock) return;
  
  let formattedNumber = phoneNumber.replace(/[^0-9]/g, "");
  if (formattedNumber.length === 10) formattedNumber = "91" + formattedNumber;
  const jid = `${formattedNumber}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, { text: messageText });
    console.log(`📩 WhatsApp मेसेज ${phoneNumber} ला पाठवला!`);
  } catch (err) {
    console.error(`❌ Send Error:`, err.message);
  }
}

// 🌐 Student Registration API
const allowedEnrollments = [];
for (let i = 1; i <= 80; i++) {
  const paddedNumber = String(i).padStart(4, '0');
  allowedEnrollments.push(`GHRUA2501114${paddedNumber}`);
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

// ⏰ Timetable and Cron Job
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

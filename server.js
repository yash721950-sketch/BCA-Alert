import express from "express";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 🔔 OneSignal Credentials
const ONESIGNAL_APP_ID = "d2ced897-0702-4d42-a341-8c9e0821cc6f";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

// 📍 COLLEGE GPS COORDINATES (G H Raisoni University, Amravati)
const COLLEGE_LAT = 20.9320; 
const COLLEGE_LNG = 77.7516; 
const MAX_ALLOWED_DISTANCE_METERS = 150; 

// 📞 Teachers Contact Database
let teachersMap = {
  "Prof. Anuj S. Deshmukh": "8605685337",
  "Dr. Vaibhav V. Thakare": "9766045765",
  "Prof. Rahul G. Nimbokar": "9890622417",
  "Dr. Sonali Nimbhorkar": "9923690055",
  "Prof. Shekhar Todakar": "7038258455",
  "Dr. Shailesh R. Thakare": "9922625194",
  "Prof. Pranav A. Dhabarde": "7020030615",
  "Dr. Amar More": "9423621602",
  "Prof. Ashwini Rathi": "",  
  "Sachin J. Deshpande": ""   
};

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
      console.error("❌ MySQL कनेक्शन फेल:", err.message);
      setTimeout(handleDisconnect, 2000);
    } else {
      console.log("✅ MySQL डेटाबेस कनेक्ट झाला! 🛢️");
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
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createAttendanceTable = `
    CREATE TABLE IF NOT EXISTS lecture_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      enroll_no VARCHAR(50) NOT NULL,
      student_name VARCHAR(100) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      teacher VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL,
      date_recorded DATE DEFAULT (CURRENT_DATE),
      time_recorded TIME DEFAULT (CURRENT_TIME),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  db.query(createStudentsTable, () => {
    // Password Column नसला तर ॲड करण्यासाठी सेफ्टी चेक
    db.query("ALTER TABLE bca_students ADD COLUMN IF NOT EXISTS password VARCHAR(255) NOT NULL DEFAULT '123456'", () => {});
  });
  db.query(createAttendanceTable, () => {});
}

// 📏 Haversine Formula (GPS Distance)
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

// 🔐 Student Login API (With Password)
app.post("/api/login", (req, res) => {
  const { enroll_no, password } = req.body;
  if (!enroll_no || !password) return res.status(400).json({ error: "Please fill all fields." });

  const cleanEnroll = String(enroll_no).trim().toUpperCase();

  const sql = "SELECT * FROM bca_students WHERE enroll_no = ? AND password = ?";
  db.query(sql, [cleanEnroll, password], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (results.length === 0) return res.status(401).json({ error: "Invalid Enrollment Number or Password!" });
    
    res.json({ success: true, student: results[0] });
  });
});

// 🌐 Student Registration API (With Password)
const allowedEnrollments = [];
for (let i = 1; i <= 80; i++) {
  const paddedNumber = String(i).padStart(4, '0');
  allowedEnrollments.push(`GHRUA2501114${paddedNumber}`);
}

app.post("/api/subscribe", (req, res) => {
  const { phone, name, enroll_no, sem, password } = req.body;
  if (!phone || !name || !enroll_no || !sem || !password) return res.status(400).send("Please fill all fields.");
  
  const studentEnroll = String(enroll_no).trim().toUpperCase(); 
  if (!allowedEnrollments.includes(studentEnroll)) return res.status(403).send("Access Denied.");

  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  if (cleanPhone.length === 10) {
    const checkSql = "SELECT * FROM bca_students WHERE phone = ? OR enroll_no = ?";
    db.query(checkSql, [cleanPhone, studentEnroll], (checkErr, results) => {
      if (checkErr) return res.status(500).send("Database Error.");
      if (results && results.length > 0) return res.status(409).send("Already Registered.");

      const insertSql = "INSERT INTO bca_students (phone, name, enroll_no, sem, password) VALUES (?, ?, ?, ?, ?)";
      db.query(insertSql, [cleanPhone, name, studentEnroll, sem, password], (err) => {
        if (err) return res.status(500).send("Database Error.");
        res.sendStatus(200);
      });
    });
  } else {
    res.status(400).send("Invalid Phone Number.");
  }
});

// 🔑 Forgot Password Reset API (Enrollment + Mobile Verification)
app.post("/api/reset-password", (req, res) => {
  const { enroll_no, phone, new_password } = req.body;
  if (!enroll_no || !phone || !new_password) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const cleanEnroll = String(enroll_no).trim().toUpperCase();
  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  const checkSql = "SELECT * FROM bca_students WHERE enroll_no = ? AND phone = ?";
  db.query(checkSql, [cleanEnroll, cleanPhone], (err, results) => {
    if (err) return res.status(500).json({ error: "Database Error." });
    if (results.length === 0) {
      return res.status(404).json({ error: "Enrollment and Phone Number mismatch! Verification failed." });
    }

    const updateSql = "UPDATE bca_students SET password = ? WHERE enroll_no = ?";
    db.query(updateSql, [new_password, cleanEnroll], (upErr) => {
      if (upErr) return res.status(500).json({ error: "Failed to reset password." });
      res.json({ success: true, message: "Password updated successfully! Please login with your new password." });
    });
  });
});

// 📍 Mark Attendance
app.post("/api/attendance/mark", (req, res) => {
  const { enroll_no, name, subject, teacher, status, userLat, userLng } = req.body;

  if (!enroll_no || !subject) return res.status(400).json({ error: "Missing required details." });

  if (status === "YES") {
    if (!userLat || !userLng) {
      return res.status(400).json({ error: "Location permission required to mark attendance!" });
    }
    const distance = getDistanceFromLatLonInMeters(userLat, userLng, COLLEGE_LAT, COLLEGE_LNG);
    if (distance > MAX_ALLOWED_DISTANCE_METERS) {
      return res.status(403).json({ error: "You are not in College Campus! Attendance Denied." });
    }
  }

  const finalStatus = (status === "YES") ? "PRESENT" : "ABSENT";

  const sql = "INSERT INTO lecture_attendance (enroll_no, student_name, subject, teacher, status) VALUES (?, ?, ?, ?, ?)";
  db.query(sql, [enroll_no, name, subject, teacher || "Faculty", finalStatus], (err) => {
    if (err) return res.status(500).json({ error: "Database error." });
    res.json({ success: true, status: finalStatus });
  });
});

// 👑 Admin API: Today's Attendance List
app.get("/api/admin/attendance", (req, res) => {
  const sql = "SELECT * FROM lecture_attendance WHERE date_recorded = CURRENT_DATE ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: "Database error." });
    res.json(results);
  });
});

// 👑 Admin API: Delete Attendance
app.post("/api/admin/attendance/delete", (req, res) => {
  const { id } = req.body;
  const sql = "DELETE FROM lecture_attendance WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ error: "Failed to delete record." });
    res.json({ success: true });
  });
});

// 📲 Admin API: WhatsApp Attendance Report Link
app.get("/api/admin/whatsapp-link", (req, res) => {
  const { teacher, subject } = req.query;
  let rawPhone = teachersMap[teacher];

  if (!rawPhone) {
    return res.status(404).json({ error: "Teacher contact missing!" });
  }

  let cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

  const sql = `SELECT student_name, enroll_no, status FROM lecture_attendance WHERE subject = ? AND date_recorded = CURRENT_DATE`;

  db.query(sql, [subject], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });

    const presentList = results.filter(r => r.status === 'PRESENT').map(r => `• ${r.student_name} (${r.enroll_no})`).join("\n");
    const absentList = results.filter(r => r.status === 'ABSENT').map(r => `• ${r.student_name} (${r.enroll_no})`).join("\n");

    const message = `📢 *BCA Department Attendance Report*\n\n` +
                    `📚 *Subject:* ${subject}\n` +
                    `👨‍🏫 *Faculty:* ${teacher}\n` +
                    `📅 *Date:* ${new Date().toLocaleDateString('en-IN')}\n\n` +
                    `✅ *PRESENT STUDENTS (${results.filter(r => r.status === 'PRESENT').length}):*\n${presentList || "None"}\n\n` +
                    `❌ *ABSENT STUDENTS (${results.filter(r => r.status === 'ABSENT').length}):*\n${absentList || "None"}\n\n` +
                    `_Generated via BCA Alert System_`;

    const encodedMessage = encodeURIComponent(message);
    res.json({ success: true, whatsappUrl: `https://wa.me/${cleanPhone}?text=${encodedMessage}` });
  });
});

// 🔔 OneSignal Interactive Push Function
async function sendOneSignalNotification(title, messageText, subject = "", teacher = "") {
  if (!ONESIGNAL_REST_API_KEY) return;
  const cleanKey = ONESIGNAL_REST_API_KEY.trim();

  try {
    await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Key ${cleanKey}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ["All", "Total Subscriptions"],
        headings: { en: title || "📢 BCA Lecture Alert" },
        contents: { en: messageText },
        buttons: [
          { id: "yes_btn", text: "🟢 YES (PRESENT)", icon: "ic_menu_send" },
          { id: "no_btn", text: "🔴 NO (ABSENT)", icon: "ic_menu_close_clear_cancel" }
        ],
        data: { subject, teacher }
      })
    });
  } catch (err) {
    console.error("❌ Push Error:", err.message);
  }
}

// ⏰ TIMETABLE (SESSION 2026-27)
let sentAlertsLog = {}; 
const timetable = {
  MON: [
    { start: "10:00", end: "11:00", subject: "Advance Excel Lab A1 / CG Lab A2", teacher: "Prof. Pranav A. Dhabarde / Dr. Vaibhav V. Thakare", room: "CC_Lab-203 / CC_Lab-204" },
    { start: "11:00", end: "12:00", subject: "Advance Excel Lab A1 / CG Lab A2", teacher: "Prof. Pranav A. Dhabarde / Dr. Vaibhav V. Thakare", room: "CC_Lab-203 / CC_Lab-204" },
    { start: "12:45", end: "13:45", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar", room: "Room 103" },
    { start: "13:45", end: "14:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh", room: "Room 103" },
    { start: "15:00", end: "16:00", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar", room: "Room 103" }
  ],
  TUE: [
    { start: "10:00", end: "11:00", subject: "MOS Lab A1 / Ecommerce Lab A2", teacher: "Dr. Sonali Nimbhorkar / Dr. Shailesh R. Thakare", room: "CC_Lab-203 / CC_Lab-204" },
    { start: "11:00", end: "12:00", subject: "MOS Lab A1 / Ecommerce Lab A2", teacher: "Dr. Sonali Nimbhorkar / Dr. Shailesh R. Thakare", room: "CC_Lab-203 / CC_Lab-204" },
    { start: "12:45", end: "13:45", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar", room: "Room 103" }
  ]
};

cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[nowInIndia.getDay()];
  const currentHours = String(nowInIndia.getHours()).padStart(2, '0');
  const currentMinutes = String(nowInIndia.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  if (currentDay === "SAT" || currentDay === "SUN") return;

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
      const lectureMsg = `⏰ Lecture Time: ${upcomingLecture.start} - ${upcomingLecture.end}\n📚 Subject: ${upcomingLecture.subject}\n👨‍🏫 Teacher: ${upcomingLecture.teacher}\n🏫 Room No: ${upcomingLecture.room}`;
      sendOneSignalNotification("📢 BCA Lecture Alert", lectureMsg, upcomingLecture.subject, upcomingLecture.teacher);
      sentAlertsLog[alertKey] = true;
    }
  }
}, { scheduled: true, timezone: "Asia/Kolkata" });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 SY BCA Server online on port ${PORT}`));

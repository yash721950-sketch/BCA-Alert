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

// 📍 COLLEGE GPS COORDINATES (G H Raisoni University, Amravati City Office)
const COLLEGE_LAT = 20.9320; 
const COLLEGE_LNG = 77.7516; 
const MAX_ALLOWED_DISTANCE_METERS = 150; // १५० मीटरचा परिसर (कॅम्पस क्षेत्र)

// 📞 Teachers Contact Database (10 Digit Indian Numbers)
let teachersMap = {
  "Prof. Anuj S. Deshmukh": "8605685337",
  "Dr. Vaibhav V. Thakare": "9766045765",
  "Prof. Rahul G. Nimbokar": "9890622417",
  "Dr. Sonali Nimbhorkar": "9923690055",
  "Prof. Shekhar Todakar": "7038258455",
  "Dr. Shailesh R. Thakare": "9922625194",
  "Prof. Pranav A. Dhabarde": "7020030615",
  "Dr. Amar More": "9423621602",
  "Prof. Ashwini Rathi": "",  // Admin Panel वरून कधीही ॲड करता येईल
  "Sachin J. Deshpande": ""   // Admin Panel वरून कधीही ॲड करता येईल
};

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

  db.query(createStudentsTable, () => {});
  db.query(createAttendanceTable, () => {});
}

// 📏 Haversine Formula (GPS Distance Calculator in Meters)
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; 
}

app.get("/status", (req, res) => {
  res.send(`
    <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
      <h2 style="color: #7b2cbf;">✅ BCA Alert & Attendance System Active!</h2>
      <p>ॲप पूर्णपणे बॅकग्राउंडला चालू आहे भावा! 😎</p>
    </div>
  `);
});

// 🔐 Student Login API
app.post("/api/login", (req, res) => {
  const { enroll_no, phone } = req.body;
  if (!enroll_no || !phone) return res.status(400).json({ error: "Please fill all fields." });

  const cleanEnroll = String(enroll_no).trim().toUpperCase();
  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  const sql = "SELECT * FROM bca_students WHERE enroll_no = ? AND phone = ?";
  db.query(sql, [cleanEnroll, cleanPhone], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error." });
    if (results.length === 0) return res.status(401).json({ error: "Invalid Enrollment Number or Mobile Number." });
    
    res.json({ success: true, student: results[0] });
  });
});

// 📍 Mark Attendance with GPS Geofencing
app.post("/api/attendance/mark", (req, res) => {
  const { enroll_no, name, subject, teacher, status, userLat, userLng } = req.body;

  if (!enroll_no || !subject) return res.status(400).json({ error: "Missing required details." });

  // 1️⃣ Verify GPS Geofencing for YES (PRESENT)
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

// 👑 Admin API: Remove Fake Attendance
app.post("/api/admin/attendance/delete", (req, res) => {
  const { id } = req.body;
  const sql = "DELETE FROM lecture_attendance WHERE id = ?";
  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ error: "Failed to delete record." });
    res.json({ success: true });
  });
});

// 📲 Admin API: Direct WhatsApp Attendance Report Link
app.get("/api/admin/whatsapp-link", (req, res) => {
  const { teacher, subject } = req.query;
  let rawPhone = teachersMap[teacher];

  if (!rawPhone) {
    return res.status(404).json({ 
      error: "शिक्षकांचा नंबर सापडला नाही! कृपया Admin Panel मध्ये नंबर Update करा." 
    });
  }

  let cleanPhone = rawPhone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

  const sql = `
    SELECT student_name, enroll_no, status 
    FROM lecture_attendance 
    WHERE subject = ? AND date_recorded = CURRENT_DATE
  `;

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
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;

    res.json({ success: true, whatsappUrl });
  });
});

// ✏️ Admin API: Add/Update Teacher Number
app.post("/api/admin/update-teacher", (req, res) => {
  const { teacherName, phone } = req.body;
  if (!teacherName || !phone) {
    return res.status(400).json({ error: "शिक्षक नाव आणि १० अंकी नंबर आवश्यक आहे." });
  }

  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) {
    teachersMap[teacherName] = cleanPhone;
    res.json({ success: true, message: `${teacherName} यांचा नंबर (${cleanPhone}) सेव्ह झाला!` });
  } else {
    res.status(400).json({ error: "कृपया १० अंकी मोबाईल नंबर टाका." });
  }
});

// 🔔 OneSignal Interactive Push Notification Function
async function sendOneSignalNotification(title, messageText, subject = "", teacher = "") {
  if (!ONESIGNAL_REST_API_KEY) {
    console.error("❌ Error: ONESIGNAL_REST_API_KEY is missing!");
    return;
  }

  const cleanKey = ONESIGNAL_REST_API_KEY.trim();

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Key ${cleanKey}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ["All", "Total Subscriptions"],
        headings: { en: title || "📢 BCA Department Alert" },
        contents: { en: messageText },
        buttons: [
          { id: "yes_btn", text: "🟢 YES (PRESENT)", icon: "ic_menu_send" },
          { id: "no_btn", text: "🔴 NO (ABSENT)", icon: "ic_menu_close_clear_cancel" }
        ],
        data: { subject, teacher }
      })
    });

    const data = await response.json();
    console.log("✅ Push Notification Broadcast Result:", data);
  } catch (err) {
    console.error("❌ OneSignal Push Error:", err.message);
  }
}

// 📲 ADMIN PANEL UI
app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>BCA Notice & Attendance Admin</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; padding: 15px; margin: 0; }
        .card { max-width: 600px; margin: 15px auto; background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h2, h3 { text-align: center; color: #7b2cbf; margin-bottom: 15px; }
        label { font-weight: bold; display: block; margin-top: 10px; color: #333; }
        textarea, input { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; font-size: 14px; }
        textarea { height: 100px; resize: vertical; }
        button { width: 100%; background: #7b2cbf; color: white; border: none; padding: 12px; font-size: 15px; font-weight: bold; border-radius: 8px; margin-top: 15px; cursor: pointer; }
        button:hover { background: #9d4edd; }
        .whatsapp-btn { background: #25D366 !important; }
        .whatsapp-btn:hover { background: #128C7E !important; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>📢 Broadcast Notice / Custom Push</h2>
        <form action="/admin/send" method="POST">
          <label>Message:</label>
          <textarea name="full_message" placeholder="📢 Type custom message..." required></textarea>
          <button type="submit">🚀 BROADCAST PUSH NOTIFICATION</button>
        </form>
      </div>

      <div class="card">
        <h3>✏️ Update Teacher Phone Number</h3>
        <form id="updateTeacherForm">
          <label>Teacher Name:</label>
          <input type="text" id="teacherName" placeholder="e.g. Prof. Ashwini Rathi" required />
          <label>10-Digit Mobile Number:</label>
          <input type="tel" id="teacherPhone" placeholder="e.g. 9876543210" required />
          <button type="button" onclick="updateTeacher()">💾 Save Teacher Number</button>
        </form>
      </div>

      <script>
        async function updateTeacher() {
          const name = document.getElementById('teacherName').value;
          const phone = document.getElementById('teacherPhone').value;
          const res = await fetch('/api/admin/update-teacher', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacherName: name, phone: phone })
          });
          const data = await res.json();
          alert(data.message || data.error);
        }
      </script>
    </body>
    </html>
  `);
});

app.post("/admin/send", async (req, res) => {
  const { full_message } = req.body;
  if (!full_message) return res.send("❌ मेसेज टेक्स्ट रिकामे असू शकत नाही.");

  await sendOneSignalNotification("📢 BCA Department Notice", full_message);

  res.send(`
    <div style="text-align:center; padding:40px; font-family:sans-serif;">
      <h2 style="color:green;">✅ Push Notification Sent Successfully!</h2>
      <p style="background:#e1f5fe; padding:15px; border-radius:8px; display:inline-block; max-width:80%;"><b>Message:</b><br>${full_message}</p><br>
      <a href="/admin" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#7b2cbf; color:white; text-decoration:none; border-radius:5px;">← बॅक जा</a>
    </div>
  `);
});

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
      if (results && results.length > 0) return res.status(409).send("Already Registered.");

      const insertSql = "INSERT INTO bca_students (phone, name, enroll_no, sem) VALUES (?, ?, ?, ?)";
      db.query(insertSql, [cleanPhone, name, studentEnroll, sem], (err) => {
        if (err) return res.status(500).send("Database Error.");
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
    { start: "10:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde", room: "Lab 1" },
    { start: "11:00", subject: "Lab on Ecommerce", teacher: "Dr. Shailesh R. Thakare", room: "Lab 2" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh", room: "Room 101" },
    { start: "13:45", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar", room: "Room 101" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator", room: "Project Lab" },
    { start: "16:00", subject: "Library", teacher: "Library Staff", room: "Library" },
  ],
  TUE: [
    { start: "10:00", subject: "Management Information System", teacher: "Dr. Shailesh R. Thakare", room: "Room 101" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar", room: "Room 101" },
    { start: "12:45", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde", room: "Lab 1" },
    { start: "13:45", subject: "Lab on Modern Operating System", teacher: "Dr. Sonali Nimbhorkar", room: "Lab 3" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator", room: "Project Lab" },
    { start: "16:00", subject: "Library", teacher: "Library Staff", room: "Library" },
  ],
  WED: [
    { start: "10:00", subject: "Lab on Computer Graphics", teacher: "Dr. Vaibhav V. Thakare", room: "Lab 2" },
    { start: "11:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde", room: "Lab 1" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh", room: "Room 101" },
    { start: "13:45", subject: "Aptitude", teacher: "Sachin J. Deshpande", room: "Room 101" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More", room: "Ground" },
    { start: "16:00", subject: "Physical Education", teacher: "Dr. Amar More", room: "Ground" },
  ],
  THU: [
    { start: "10:00", subject: "Management Information System", teacher: "Dr. Shailesh R. Thakare", room: "Room 101" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar", room: "Room 101" },
    { start: "12:45", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar", room: "Room 101" },
    { start: "13:45", subject: "Communication Skill", teacher: "Prof. Ashwini Rathi", room: "Room 101" },
    { start: "15:00", subject: "Lab on Modern Operating System", teacher: "Dr. Sonali Nimbhorkar", room: "Lab 3" },
    { start: "16:00", subject: "Lab on Computer Graphics", teacher: "Dr. Vaibhav V. Thakare", room: "Lab 2" },
  ],
  FRI: [
    { start: "10:00", subject: "Communication Skill", teacher: "Prof. Ashwini Rathi", room: "Room 101" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar", room: "Room 101" },
    { start: "12:45", subject: "Lab on Ecommerce", teacher: "Dr. Shailesh R. Thakare", room: "Lab 2" },
    { start: "13:45", subject: "Advance Excel", teacher: "Prof. Pranav A. Dhabarde", room: "Room 101" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More", room: "Ground" },
    { start: "16:00", subject: "Physical Education", teacher: "Dr. Amar More", room: "Ground" },
  ],
};

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
        sendOneSignalNotification("🌴 Weekend Notice", "Weekend Holiday: No Classes Today. Enjoy your weekend!");
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
      const lectureMsg = `📢 Lecture Alert: ${upcomingLecture.subject} at ${upcomingLecture.start} in ${upcomingLecture.room}. Are you attending?`;
      sendOneSignalNotification("📚 Lecture Attendance Alert", lectureMsg, upcomingLecture.subject, upcomingLecture.teacher);
      sentAlertsLog[alertKey] = true;
    }
  }
}, {
  scheduled: true,
  t

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

// 🔔 OneSignal Credentials (ONLY via Environment Variables)
const ONESIGNAL_APP_ID = "d2ced897-0702-4d42-a341-8c9e0821cc6f";
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

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

app.get("/status", (req, res) => {
  res.send(`
    <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
      <h2 style="color: #7b2cbf;">✅ OneSignal PWA Push Alert System Active!</h2>
      <p>ॲप पूर्णपणे बॅकग्राउंडला चालू आहे भावा! 😎</p>
    </div>
  `);
});

// 🔔 OneSignal द्वारे डायरेक्ट पुश नोटिफिकेशन पाठवण्याचे मुख्य फंक्शन
async function sendOneSignalNotification(title, messageText) {
  if (!ONESIGNAL_REST_API_KEY) {
    console.error("❌ Error: ONESIGNAL_REST_API_KEY is missing in Render Environment!");
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
        contents: { en: messageText }
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
      <title>BCA Notice Admin Panel</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; padding: 20px; margin: 0; }
        .card { max-width: 500px; margin: 20px auto; background: #fff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h2 { text-align: center; color: #7b2cbf; margin-bottom: 20px; }
        label { font-weight: bold; display: block; margin-top: 12px; color: #333; }
        textarea { width: 100%; height: 150px; padding: 12px; margin-top: 8px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; font-size: 15px; resize: vertical; }
        button { width: 100%; background: #7b2cbf; color: white; border: none; padding: 14px; font-size: 16px; font-weight: bold; border-radius: 8px; margin-top: 20px; cursor: pointer; }
        button:hover { background: #9d4edd; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>📢 Send Push Notification Notice</h2>
        <form action="/admin/send" method="POST">
          <label>Type Your Message Here:</label>
          <textarea name="full_message" placeholder="📢 NOTICE: Type your custom message here..." required></textarea>

          <button type="submit">🚀 BROADCAST PUSH NOTIFICATION</button>
        </form>
      </div>
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
    db.query(checkSql, [checkSql, cleanPhone, studentEnroll], (checkErr, results) => {
      if (checkErr) return res.status(500).send("Database Error.");
      if (results.length > 0) return res.status(409).send("Already Registered.");

      const sql = "INSERT INTO bca_students (phone, name, enroll_no, sem) VALUES (?, ?, ?, ?)";
      db.query(sql, [cleanPhone, name, studentEnroll, sem], (err) => {
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
      const lectureMsg = `📢 Lecture Alert: ${upcomingLecture.subject} is scheduled at ${upcomingLecture.start} with ${upcomingLecture.teacher}.`;
      sendOneSignalNotification("📚 Lecture Alert", lectureMsg);
      sentAlertsLog[alertKey] = true;
    }
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 OneSignal PWA Push Server online at port ${PORT}`));

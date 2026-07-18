const express = require("express");
const cron = require("node-cron");
const path = require("path");
const axios = require("axios");
const mysql = require("mysql2"); 

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔑 तुझी Fast2SMS API Key
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "3AlbuU40tVZodDdi0avMxTI3U05B8UfaMd6g1tOrbSFon0peTuKTN8v13G3I"; 

const db = mysql.createPool({
  host: "mysql-3a8a9382-yash721950-fa6f.b.aivencloud.com",      
  port: 27814,
  user: "avnadmin",           
  password: "AVNS_kpN5Gy9-j1TmgoZg7o7",   
  database: "defaultdb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL डेटाबेस कनेक्शन फेल:", err.message);
  } else {
    console.log("✅ MySQL डेटाबेस यशस्वीरित्या कनेक्ट झाला! 🛢️");
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bca_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(15) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        enroll_no VARCHAR(50) UNIQUE NOT NULL,
        sem VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    connection.query(createTableQuery, (tableErr) => {
      connection.release();
      if (tableErr) console.error("❌ टेबल तयार करताना एरर आला:", tableErr.message);
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
    { start: "16:00", text: "Physical Education", teacher: "Dr. Amar More" },
  ],
};

const allowedEnrollments = [];
for (let i = 1; i <= 80; i++) {
  const paddedNumber = String(i).padStart(4, '0');
  allowedEnrollments.push(`GHRUA2501114${paddedNumber}`);
}

// 🛠️ सुरक्षित रजिस्ट्रेशन राऊट (Fast2SMS JSON API आणि v3 रूटसह)
app.post("/api/subscribe", (req, res) => {
  const { phone, name, enroll_no, sem } = req.body;

  if (!phone || !name || !enroll_no || !sem) {
    return res.status(400).send("Please fill all fields.");
  }

  const studentEnroll = String(enroll_no).trim().toUpperCase(); 
  if (!allowedEnrollments.includes(studentEnroll)) {
    console.log(`⚠️ अनधिकृत प्रवेशाचा प्रयत्न! Enrollment: ${studentEnroll}`);
    return res.status(403).send("Access Denied.");
  }

  let cleanPhone = phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  if (cleanPhone.length === 10) {
    const checkSql = "SELECT * FROM bca_students WHERE phone = ? OR enroll_no = ?";
    db.query(checkSql, [cleanPhone, studentEnroll], (checkErr, results) => {
      if (checkErr) return res.status(500).send("Database Error.");

      if (results.length > 0) {
        console.log(`ℹ️ User already registered: ${studentEnroll}`);
        return res.status(409).send("Already Registered.");
      }

      const sql = "INSERT INTO bca_students (phone, name, enroll_no, sem) VALUES (?, ?, ?, ?)";
      db.query(sql, [cleanPhone, name, studentEnroll, sem], (err, result) => {
        if (err) return res.status(500).send("Database Error.");
        
        console.log(`🚀 Successfully verified & registered student: ${name} (${studentEnroll})`);
        
        // 🛠️ Fast2SMS ला सरळ JSON बॉडीमध्ये 'v3' रूटवर मेसेज पाठवणे (हा कधीच 400 एरर देत नाही)
        const welcomeMessage = `Hi ${name}, your registration on BCA Alerts portal is successful!`;

        axios.post("https://www.fast2sms.com/dev/bulkV2", {
          route: "v3",
          sender_id: "TXTIND",
          message: welcomeMessage,
          language: "english",
          numbers: String(cleanPhone).trim()
        }, {
          headers: { 
            "authorization": FAST2SMS_API_KEY,
            "Content-Type": "application/json"
          }
        })
        .then(() => console.log(`📩 Welcome SMS sent successfully to ${name}`))
        .catch((smsErr) => console.error(`❌ Welcome SMS Error:`, smsErr.response ? JSON.stringify(smsErr.response.data) : smsErr.message));

        res.sendStatus(200);
      });
    });
  } else {
    res.status(400).send("Invalid Phone Number.");
  }
});

// 🧪 डेमो टेस्ट राऊट (v3 फॉरमॅटसह)
app.get("/api/test-sms", (req, res) => {
  const testNumber = "7219502467"; 
  const demoMessage = "BCA Alert Portal Test Message Success.";

  axios.post("https://www.fast2sms.com/dev/bulkV2", {
    route: "v3",
    sender_id: "TXTIND",
    message: demoMessage,
    language: "english",
    numbers: testNumber
  }, {
    headers: { 
      "authorization": FAST2SMS_API_KEY,
      "Content-Type": "application/json"
    }
  })
  .then(() => res.send("Fast2SMS Demo Sent Successfully!"))
  .catch((err) => res.status(500).send("Fast2SMS Error: " + (err.response ? JSON.stringify(err.response.data) : err.message)));
});

// 🚀 Automation Cron
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

          const holidayMessage = "BCA Alerts: It's your holiday! Enjoy your day!";
          const allNumbers = results.map(row => row.phone).join(",");

          axios.post("https://www.fast2sms.com/dev/bulkV2", {
            route: "v3",
            sender_id: "TXTIND",
            message: holidayMessage,
            language: "english",
            numbers: allNumbers
          }, {
            headers: { 
              "authorization": FAST2SMS_API_KEY,
              "Content-Type": "application/json"
            }
          })
          .then(() => console.log("📢 Holiday SMS sent successfully!"))
          .catch((err) => console.error("❌ Holiday SMS Error:", err.message));
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
        if (err) {
          console.error("❌ क्रॉन जॉबमध्ये नंबर काढताना एरर:", err.message);
          return;
        }

        if (results.length > 0) {
          const alertMessage = `BCA Class Alert: ${upcomingLecture.subject} by ${upcomingLecture.teacher} at ${upcomingLecture.start}.`;
          const allNumbers = results.map(row => row.phone).join(",");

          axios.post("https://www.fast2sms.com/dev/bulkV2", {
            route: "v3",
            sender_id: "TXTIND",
            message: alertMessage,
            language: "english",
            numbers: allNumbers
          }, {
            headers: { 
              "authorization": FAST2SMS_API_KEY,
              "Content-Type": "application/json"
            }
          })
          .then(() => console.log("📢 Lecture Alerts sent successfully!"))
          .catch((err) => console.error("❌ Fast2SMS API Error:", err.message));
        }
      });

      sentAlertsLog[alertKey] = true;
    }
  }

  for (const key in sentAlertsLog) {
    if (key.includes("holiday")) continue; 
    
    const [day, startTime] = key.split("-");
    if (day === currentDay) {
      const [lHours, lMinutes] = startTime.split(":");
      const lectureTime = new Date(nowInIndia);
      lectureTime.setHours(parseInt(lHours), parseInt(lMinutes), 0, 0);
      if (nowInIndia > lectureTime) delete sentAlertsLog[key];
    }
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Website engine online at port ${PORT}`));

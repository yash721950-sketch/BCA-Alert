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
app.use(express.static(path.join(__dirname, "public")));

// 🔑 माझे Meta Official API Credentials
const PHONE_NUMBER_ID = "1225231590674644"; 
const ACCESS_TOKEN = "EAAdxAucVo1cBSEiiv0niYKHgPapGNE4hswRJ5PWlzZBnnDpF0g4iy3CQ4lcR2SWbYebP0j0YZABq4ep1x3r5DCK4tvFTP5aUK8TiJaGYtXj93tGZBLQPB55Mlcue6W9XCNYw9ywmLqrYgabpjg6NdoFedNfV7IRgLUH2VH4AVk66focEtdPhm0CSeTvTwZDZD"; 

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

// 🌐 स्टेटस चेक करण्यासाठीचा रूट
app.get("/status", (req, res) => {
  res.send(`
    <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
      <h2 style="color: green;">✅ Meta Official WhatsApp API Active!</h2>
      <p>बॉट कसल्याही एररशिवाय १००% ऑटोमॅटिक बॅकग्राउंडला चालू आहे भावा! 😎</p>
    </div>
  `);
});

// 📩 Meta API द्वारे WhatsApp मेसेज पाठवण्याचे फंक्शन
async function sendWhatsAppAlert(phoneNumber, subject, teacher, time) {
  let cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;

  const subText = subject || "BCA Classes";
  const teachText = teacher || "Department Faculty";
  const timeText = time || "As per timetable";

  const payload = {
    messaging_product: "whatsapp",
    to: cleanPhone,
    type: "template",
    template: {
      name: "lecture_alert",
      language: { code: "en_US" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: subText },   // {{1}} = Title / Subject
            { type: "text", text: teachText }, // {{2}} = Message Text / Teacher
            { type: "text", text: timeText }   // {{3}} = Extra Info / Time
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.messages) {
      console.log(`📩 Meta WhatsApp मेसेज ${cleanPhone} ला यशस्वीरित्या पाठवला! [Subject: ${subText}]`);
    } else {
      console.error(`❌ Meta Send Error:`, JSON.stringify(data, null, 2));
    }
  } catch (err) {
    console.error(`❌ Fetch Request Error:`, err.message);
  }
}

// 💬 1. ADMIN ROUTE: तुला स्वतःला वाटेल तो Custom Message पाठवण्यासाठी
app.get("/api/custom-message", (req, res) => {
  const { title, text, info } = req.query;

  if (!text) {
    return res.status(400).send("❌ कृपया मेसेज लिहा. उदा: ?title=NOTICE&text=Tomorrow%20is%20holiday&info=College%20Closed");
  }

  const msgTitle = title ? `[${title}]` : "📢 BCA Notice";
  const msgText = text;
  const msgInfo = info || "BCA Department";

  db.query("SELECT phone FROM bca_students", (err, results) => {
    if (err || results.length === 0) return res.status(500).send("No students found.");
    
    results.forEach(row => {
      sendWhatsAppAlert(row.phone, msgTitle, msgText, msgInfo);
    });
    
    res.send(`✅ Custom message ("${msgText}") सर्व विद्यार्थ्यांना यशस्वीरित्या पाठवला!`);
  });
});

// 🚫 2. ADMIN ROUTE: लेक्चर कॅन्सल करण्यासाठी
app.get("/api/cancel-lecture", (req, res) => {
  const { subject, reason } = req.query;
  
  if (!subject) {
    return res.status(400).send("❌ कृपया विषय (subject) टाका. उदा: ?subject=Aptitude&reason=Teacher%20Absent");
  }

  const cancelSubject = `CANCELLED: ${subject}`;
  const cancelTeacher = reason || "Faculty Unavailable";
  const cancelTime = "Today's Slot";

  db.query("SELECT phone FROM bca_students", (err, results) => {
    if (err || results.length === 0) return res.status(500).send("No students found.");
    
    results.forEach(row => {
      sendWhatsAppAlert(row.phone, cancelSubject, cancelTeacher, cancelTime);
    });
    
    res.send(`✅ ${subject} च्या लेक्चर कॅन्सलेशनचा मेसेज सर्व विद्यार्थ्यांना यशस्वीरित्या पाठवला!`);
  });
});

// 🔄 3. ADMIN ROUTE: दुसऱ्या शिक्षकांनी लेक्चर घेतल्यास (Substitute Lecture)
app.get("/api/substitute-lecture", (req, res) => {
  const { subject, teacher, time } = req.query;

  if (!subject || !teacher) {
    return res.status(400).send("❌ कृपया subject आणि teacher टाका. उदा: ?subject=Computer%20Graphics&teacher=Prof.%20Anuj&time=01:45%20PM");
  }

  const subSubject = `[Updated Class] ${subject}`;
  const subTeacher = teacher;
  const subTime = time || "Current Slot";

  db.query("SELECT phone FROM bca_students", (err, results) => {
    if (err || results.length === 0) return res.status(500).send("No students found.");
    
    results.forEach(row => {
      sendWhatsAppAlert(row.phone, subSubject, subTeacher, subTime);
    });
    
    res.send(`✅ ${subject} (by ${teacher}) च्या बदलाचा मेसेज सर्व विद्यार्थ्यांना पाठवला!`);
  });
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
      if (results.length > 0) return res.status(409).send("Already Registered.");

      const sql = "INSERT INTO bca_students (phone, name, enroll_no, sem) VALUES (?, ?, ?, ?)";
      db.query(sql, [cleanPhone, name, studentEnroll, sem], (err) => {
        if (err) return res.status(500).send("Database Error.");
        
        sendWhatsAppAlert(cleanPhone, "Registration Successful", "BCA Alert System", "Now Active");
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
        db.query("SELECT phone FROM bca_students", (err, results) => {
          if (err || results.length === 0) return;
          results.forEach(row => {
            sendWhatsAppAlert(row.phone, "Weekend Holiday", "No Classes Today", "Enjoy Weekend!");
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
          sendWhatsAppAlert(row.phone, upcomingLecture.subject, upcomingLecture.teacher, upcomingLecture.start);
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
app.listen(PORT, () => console.log(`Meta Official Server online at port ${PORT}`));

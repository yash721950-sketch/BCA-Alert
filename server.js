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

// 🔑 माझे Meta Official API Credentials
const PHONE_NUMBER_ID = "1225234990674644"; 
const ACCESS_TOKEN = "EAAdxAucVo1cBSOHcZAviCNfO5NV4EGJtmsAbx6c6rsDmRZCmy2JpHyUN7liicDB05VXQNrmmJdn7X3CDBNEKUSF3vFAVBY076SrLpNhtfQ9HgbOhfMbtz8vTQWZB3qRt6WPF5pMOZAZChevdzbEVGyU6kFTVWNUiS18bZBMkhHfC055wx8R2ywG2FOtYC7XgZDZD"; 

// 🔐 Meta Webhook Verify Token
const VERIFY_TOKEN = "bcaalerts123"; 

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

// 🔗 Meta Webhook Verification (Meta कडून येणारी रिक्वेस्ट व्हेरीफाय करण्यासाठी)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("✅ Webhook Verified Successfully!");
      res.status(200).send(challenge);
    } else {
      console.error("❌ Verification failed. Token mismatch!");
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

app.post("/webhook", (req, res) => {
  res.status(200).send("EVENT_RECEIVED");
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
            { type: "text", text: subText },   
            { type: "text", text: teachText }, 
            { type: "text", text: timeText }   
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

// 📲 ADMIN PANEL UI
app.get("/admin", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>BCA Alert Admin Panel</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f0f2f5; padding: 20px; margin: 0; }
        .card { max-width: 450px; margin: 20px auto; background: #fff; padding: 25px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        h2 { text-align: center; color: #075e54; margin-bottom: 20px; }
        label { font-weight: bold; display: block; margin-top: 12px; color: #333; }
        input, select { width: 100%; padding: 12px; margin-top: 6px; border: 1px solid #ccc; border-radius: 8px; box-sizing: border-box; font-size: 15px; }
        button { width: 100%; background: #25d366; color: white; border: none; padding: 14px; font-size: 16px; font-weight: bold; border-radius: 8px; margin-top: 20px; cursor: pointer; }
        button:hover { background: #128c7e; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>📢 Send WhatsApp Alert</h2>
        <form action="/admin/send" method="POST">
          <label>Header / Title ({{1}}):</label>
          <input type="text" name="title" placeholder="e.g. CANCELLED / NOTICE" required value="NOTICE">

          <label>Main Message / Subject ({{2}}):</label>
          <input type="text" name="text" placeholder="e.g. Aptitude Class Cancelled" required>

          <label>Extra Info / Teacher Name ({{3}}):</label>
          <input type="text" name="info" placeholder="e.g. Prof. Sachin Absent / Today" required value="BCA Dept">

          <button type="submit">🚀 SEND WHATSAPP MESSAGE</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

// 🚀 ADMIN POST API
app.post("/admin/send", (req, res) => {
  const { title, text, info } = req.body;

  if (!text) return res.send("❌ मेसेज टेक्स्ट रिकामे असू शकत नाही.");

  const msgTitle = title ? `[${title}]` : "📢 BCA Notice";
  const msgText = text;
  const msgInfo = info || "BCA Department";

  db.query("SELECT phone FROM bca_students", (err, results) => {
    if (err || results.length === 0) {
      return res.send("<h2 style='color:red;'>❌ सिस्टीममध्ये कोणतेही विद्यार्थी रजिस्टर नाहीत किंवा DB एरर.</h2>");
    }
    
    results.forEach(row => {
      sendWhatsAppAlert(row.phone, msgTitle, msgText, msgInfo);
    });
    
    res.send(`
      <div style="text-align:center; padding:40px; font-family:sans-serif;">
        <h2 style="color:green;">✅ WhatsApp Message Sent Successfully!</h2>
        <p><b>Title:</b> ${msgTitle}<br><b>Text:</b> ${msgText}<br><b>Info:</b> ${msgInfo}</p>
        <a href="/admin" style="display:inline-block; margin-top:15px; padding:10px 20px; background:#075e54; color:white; text-decoration:none; border-radius:5px;">← बॅक जा</a>
      </div>
    `);
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

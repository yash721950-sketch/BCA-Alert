const express = require("express");
const cron = require("node-cron");
const path = require("path");
const axios = require("axios");
const mysql = require("mysql2"); // 🛢️ MySQL पॅकेज जोडले

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔑 तुझी Fast2SMS API Key
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "FMe4AIKjH7nfrJGNYXWxSvmcht93TgPE2LyoQDikbuz8pCU6BlmtCNKX9bEyv30F6H8Vf5cJ1gindWBI"; 

// 🛢️ MySQL डेटाबेस कनेक्शन (Aiven चे लाईव्ह डिटेल्स डायरेक्ट ॲड केले आहेत)
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

// डेटाबेस चालू आहे की नाही हे तपासण्यासाठी
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ MySQL डेटाबेस कनेक्शन फेल:", err.message);
  } else {
    console.log("✅ MySQL डेटाबेस यशस्वीरित्या कनेक्ट झाला! 🛢️");
    
    // युझर्ससाठी टेबल नसेल तर ऑटोमॅटिक तयार होईल
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(15) UNIQUE NOT NULL,
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

// २. टाईमटेबल डेटा
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

// 🛠️ नंबर MySQL डेटाबेसमध्ये सेव्ह करणारा Route (Registration)
app.post("/api/subscribe", (req, res) => {
  let cleanPhone = req.body.phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.substring(2);

  if (cleanPhone.length === 10) {
    const sql = "INSERT IGNORE INTO users (phone) VALUES (?)";
    db.query(sql, [cleanPhone], (err, result) => {
      if (err) {
        console.error("❌ डेटाबेसमध्ये नंबर सेव्ह करताना एरर:", err.message);
        return res.status(500).send("Database Error.");
      }
      console.log(`🚀 Successfully registered student number in MySQL: ${cleanPhone}`);
      res.sendStatus(200);
    });
  } else {
    res.status(400).send("Invalid Phone Number.");
  }
});

// 🧪 डेमो मेसेज तपासण्यासाठी रस्ता
app.get("/api/test-sms", (req, res) => {
  const testNumber = "7219502467"; 
  const demoMessage = `Lecture Alert!\nSub: Fast2SMS Test\nProf: Gemini\nTime: Now\nRoom: 105`;

  const params = new URLSearchParams();
  params.append("route", "q"); 
  params.append("message", demoMessage);
  params.append("language", "english");
  params.append("numbers", testNumber);

  axios.post("https://www.fast2sms.com/dev/bulkV2", params, {
    headers: { "authorization": FAST2SMS_API_KEY }
  })
  .then(() => res.send("Fast2SMS Demo Sent Successfully! Check your phone."))
  .catch((err) => res.status(500).send("Fast2SMS Error: " + (err.response ? JSON.stringify(err.response.data) : err.message)));
});

// 🚀 ३. Automation Cron (दर मिनिटाला धावतो)
cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[nowInIndia.getDay()];

  const currentHours = String(nowInIndia.getHours()).padStart(2, '0');
  const currentMinutes = String(nowInIndia.getMinutes()).padStart(2, '0');
  const currentTimeStr = `${currentHours}:${currentMinutes}`;

  // 🗓️ शनिवार (SAT) आणि रविवार (SUN) साठी स्पेशल ११:१० चा सुट्टीचा मेसेज
  if (currentDay === "SAT" || currentDay === "SUN") {
    if (currentTimeStr === "11:10") {
      const holidayKey = `${currentDay}-holiday-1110`;
      
      if (!sentAlertsLog[holidayKey]) {
        db.query("SELECT phone FROM users", (err, results) => {
          if (err || results.length === 0) return;

          const holidayMessage = `BCA Alerts 🎉\n\nIt's your holiday! Enjoy your day! 🥳🕺`;
          const allNumbers = results.map(row => row.phone).join(",");

          const params = new URLSearchParams();
          params.append("route", "q");
          params.append("message", holidayMessage);
          params.append("language", "english");
          params.append("numbers", allNumbers);

          axios.post("https://www.fast2sms.com/dev/bulkV2", params, {
            headers: { "authorization": FAST2SMS_API_KEY }
          })
          .then(() => console.log(`📢 Holiday SMS sent successfully to everyone!`))
          .catch((err) => console.error(`❌ Holiday SMS Error:`, err.message));
        });

        sentAlertsLog[holidayKey] = true;
      }
    }
    return; // सुट्टीच्या दिवशी पुढचा लेक्चर कोड धावणार नाही, इथूनच रिटर्न होईल
  }

  // 📖 सोमवार ते शुक्रवारचे नेहमीचे लेक्चर्सचे लॉजिक
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
      
      db.query("SELECT phone FROM users", (err, results) => {
        if (err) {
          console.error("❌ क्रॉन जॉबमध्ये नंबर काढताना एरर:", err.message);
          return;
        }

        if (results.length > 0) {
          const alertMessage = 
            `Lecture Alert 🚀\n` +
            `Sub: ${upcomingLecture.subject}\n` +
            `Prof: ${upcomingLecture.teacher}\n` +
            `Time: ${upcomingLecture.start}\n` +
            `Room: 105`;

          const allNumbers = results.map(row => row.phone).join(",");

          const params = new URLSearchParams();
          params.append("route", "q");
          params.append("message", alertMessage);
          params.append("language", "english");
          params.append("numbers", allNumbers);

          axios.post("https://www.fast2sms.com/dev/bulkV2", params, {
            headers: { "authorization": FAST2SMS_API_KEY }
          })
          .then(() => console.log(`📢 Fast2SMS: Alerts successfully sent to all registered students!`))
          .catch((err) => console.error(`❌ Fast2SMS API Error:`, err.message));
        } else {
          console.log("ℹ️ डेटाबेसमध्ये अजून एकही नंबर रजिस्टर्ड नाही.");
        }
      });

      sentAlertsLog[alertKey] = true;
    }
  }

  for (const key in sentAlertsLog) {
    if (key.includes("holiday")) continue; // सुट्टीचा लॉग तसाच ठेवू जेणेकरून पुन्हा मेसेज जाणार नाही
    
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
           

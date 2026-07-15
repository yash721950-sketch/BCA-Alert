const express = require("express");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // Twilio ऐवजी API कॉल करण्यासाठी axios वापरणार

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🔑 तुझी Fast2SMS API Key आपण इथे सुरक्षितपणे सेट केली आहे
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "FMe4AIKjH7nfrJGNYXWxSvmcht93TgPE2LyoQDikbuz8pCU6BlmtCNKX9bEyv30F6H8Vf5cJ1gindWBI"; 

const DB_FILE = path.join(__dirname, "subscribers.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// मेसेज रिपीट होऊ नये म्हणून मेमरी लॉग
let sentAlertsLog = {}; 

// 2. टाईमटेबल डेटा
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

// 🛠️ Fast2SMS साठी फक्त १० अंकी शुद्ध नंबर डेटाबेसमध्ये सेव्ह करणारा Route
app.post("/api/subscribe", (req, res) => {
  let cleanPhone = req.body.phone.replace(/[^0-9]/g, "");
  
  if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    cleanPhone = cleanPhone.substring(2);
  }

  if (cleanPhone.length === 10) {
    const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
    if (!subscribers.includes(cleanPhone)) {
      subscribers.push(cleanPhone);
      fs.writeFileSync(DB_FILE, JSON.stringify(subscribers));
      console.log(`Successfully registered student number: ${cleanPhone}`);
    }
    res.sendStatus(200);
  } else {
    res.status(400).send("Invalid Phone Number. Please enter a 10 digit number.");
  }
});

// 🧪 तात्पुरता डेमो मेसेज तपासण्यासाठी Route (ब्राउझरमध्ये उघडून टेस्ट कर)
app.get("/api/test-sms", (req, res) => {
  const testNumber = "7219502467"; // तुझा नंबर
  const demoMessage = `Lecture Alert!\nSub: Fast2SMS Test\nProf: Gemini\nTime: Now\nRoom: 105`;

  axios.post("https://www.fast2sms.com/dev/bulkV2", {
    route: "v3",
    sender_id: "TXTIND", 
    message: demoMessage,
    language: "english",
    numbers: testNumber
  }, {
    headers: { "authorization": FAST2SMS_API_KEY }
  })
  .then(() => res.send("Fast2SMS Demo Sent Successfully! Check your phone inbox."))
  .catch((err) => res.status(500).send("Fast2SMS Error: " + err.message));
});

// 3. Automation Cron
cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[nowInIndia.getDay()];

  if (currentDay === "SUN" || currentDay === "SAT") return;

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
      const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
      
      if (subscribers.length > 0) {
        const alertMessage = 
          `Lecture Alert 🚀\n` +
          `Sub: ${upcomingLecture.subject}\n` +
          `Prof: ${upcomingLecture.teacher}\n` +
          `Time: ${upcomingLecture.start}\n` +
          `Room: 105`;

        const allNumbers = subscribers.join(",");

        axios.post("https://www.fast2sms.com/dev/bulkV2", {
          route: "v3",
          sender_id: "TXTIND",
          message: alertMessage,
          language: "english",
          numbers: allNumbers
        }, {
          headers: {
            "authorization": FAST2SMS_API_KEY
          }
        })
        .then(() => console.log(`Fast2SMS: Alerts successfully sent to all students!`))
        .catch((err) => console.error(`Fast2SMS API Error:`, err.message));
      }

      sentAlertsLog[alertKey] = true;
    }
  }

  for (const key in sentAlertsLog) {
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
// ==========================================
// 🚨 तात्पुरता लेक्चर टाईम डेमो कोड (फक्त टेस्टिंगसाठी)
// ==========================================

setTimeout(() => {
    console.log("⏱️ ५ सेकंद झाले! लेक्चर टाईमचा टेंपररी डेमो मेसेज पाठवतोय...");

    // 1. तुझ्या कोडमध्ये असलेला Fast2SMS चा मेसेज पाठवण्याचा फंक्शन इथे कॉल कर
    // (उदा. तुझ्या कोडमध्ये 'sendAlert' किंवा 'sendSMS' जे नाव असेल ते कंसात टाक)
    
    const demoOptions = {
        method: 'POST',
        url: 'https://www.fast2sms.com/dev/bulkV2',
        headers: {
            'authorization': 'तुझी_FAST2SMS_API_KEY_इथे_टाक' // तुझी मूळ की (Key) टाक
        },
        data: {
            'route': 'q', 
            // तुझ्या टाईमटेबल मधलाच मेसेज इथे कॉपी करून टाक:
            'message': 'BCA Alert DEMO: भावा, पुढच्या १० मिनिटात तुझं BCA चं लेक्चर सुरू होतंय! 🚀',
            'language': 'english',
            'numbers': 'तुझा_१०_अंकी_मोबाईल_नंबर_इथे_टाक' // तुझा नंबर
        }
    };

    // मेसेज पाठवण्याची प्रोसेस
    const axios = require('axios'); // जर आधीच वर require केलं असेल तर ही लाईन गाळू शकतोस
    axios(demoOptions)
        .then(response => {
            console.log("✅ डेमो एसएमएस यशस्वीरित्या पाठवला! मोबाईल चेक कर भावा.");
        })
        .catch(error => {
            console.error("❌ डेमो मेसेज पाठवताना एरर आला:", error.message);
        });

}, 5000); // ५००0 मिलीसेकंद = ५ सेकंद

      

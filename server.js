const express = require("express");
const cron = require("node-cron");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 1. Twilio API Credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; 
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = "+15673391350"; 

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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

// 🛠️ नंबर फॉरमॅट फिक्स करणारा Route
app.post("/api/subscribe", (req, res) => {
  let cleanPhone = req.body.phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) cleanPhone = "+91" + cleanPhone;
  else if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = "+" + cleanPhone;
  else if (!cleanPhone.startsWith("+")) cleanPhone = "+" + cleanPhone;

  const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
  if (!subscribers.includes(cleanPhone)) {
    subscribers.push(cleanPhone);
    fs.writeFileSync(DB_FILE, JSON.stringify(subscribers));
    console.log(`Successfully registered: ${cleanPhone}`);
  }
  res.sendStatus(200);
});

// 3. Automation Cron
cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[nowInIndia.getDay()];

  if (currentDay === "SUN" || currentDay === "SAT") return;

  const currentSchedule = timetable[currentDay] || [];
  
  // ५ ते १० मिनिटांची टाईम रेंज
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
      
      // 🛠️ मेसेज फॉरमॅट: यात टाईम (Time) चा समावेश केला आहे
      const alertMessage = 
        `Lecture Alert 🚀\n` +
        `Sub: ${upcomingLecture.subject}\n` +
        `Prof: ${upcomingLecture.teacher}\n` +
        `Time: ${upcomingLecture.start}\n` +  // <--- इथे टाईम दिसेल
        `Room: 105`;

      subscribers.forEach((phoneNum) => {
        client.messages
          .create({
            from: TWILIO_PHONE_NUMBER,
            to: phoneNum,            
            body: alertMessage,
          })
          .then(() => console.log(`SMS Alert successfully sent to: ${phoneNum}`))
          .catch((err) => console.error(`Twilio SMS Error for ${phoneNum}:`, err));
      });

      sentAlertsLog[alertKey] = true;
    }
  }

  // मेमरी क्लीनअप
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
          

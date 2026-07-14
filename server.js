const express = require("express");
const cron = require("node-cron");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 1. Twilio API Credentials (आता हे Render च्या Env Variables मधून व्हॅल्यू घेईल, त्यामुळे कोड सुरक्षित राहील)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; 
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// 📝 तुझा Twilio कडून मिळालेला SMS फोन नंबर इथे नीट टाकून ठेव
const TWILIO_PHONE_NUMBER = "+1XXXXXXXXXX"; 

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const DB_FILE = path.join(__dirname, "subscribers.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// 2. टाईमटेबल डेटा (तुझ्या कॉलेजच्या फोटोप्रमाणे अचूक अपडेट केला आहे)
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

// Route to handle registrations
app.post("/api/subscribe", (req, res) => {
  let phone = req.body.phone.replace(/[^0-9+]/g, "");
  if (!phone.startsWith("+")) phone = "+" + phone;

  const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
  if (!subscribers.includes(phone)) {
    subscribers.push(phone);
    fs.writeFileSync(DB_FILE, JSON.stringify(subscribers));
  }
  res.sendStatus(200);
});

// 3. Automation Cron: दर मिनिटाला चेक करेल आणि १० मिनिटे आधी मेसेज पाठवेल
cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  
  // लेक्चरच्या १० मिनिटे आधी अलर्ट जाण्यासाठी १० मिनिटांचा फरक (Offset)
  const futureOffset = new Date(nowInIndia.getTime() + 10 * 60000); 

  const targetHours = String(futureOffset.getHours()).padStart(2, "0");
  const targetMinutes = String(futureOffset.getMinutes()).padStart(2, "0");
  const timeMatchString = `${targetHours}:${targetMinutes}`;

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[futureOffset.getDay()];

  // शनिवार आणि रविवारी सुट्टी, त्यामुळे थांबेल
  if (currentDay === "SUN" || currentDay === "SAT") return;

  const currentSchedule = timetable[currentDay] || [];
  const upcomingLecture = currentSchedule.find((l) => l.start === timeMatchString);

  if (upcomingLecture) {
    const subscribers = JSON.parse(fs.readFileSync(DB_FILE));

    const alertMessage =
      `GHRU BCA Alert (Starts in 10 mins) 🚀\n\n` +
      `Subject: ${upcomingLecture.subject}\n` +
      `Teacher: ${upcomingLecture.teacher}\n` +
      `Time: ${upcomingLecture.start}\n` +
      `Room: Class Room No. 105\n\n` +
      `भावा, लवकर क्लासमध्ये पोहोच!`;

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
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Website engine online at port ${PORT}`)
);

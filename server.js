const express = require("express");
const cron = require("node-cron");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 1. Twilio API Credentials (Render च्या Env Variables मधून व्हॅल्यू घेईल)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; 
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// 📝 तुझा Twilio कडून मिळालेला SMS फोन नंबर इथे नीट टाकून ठेव
const TWILIO_PHONE_NUMBER = "+15673391350"; 

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const DB_FILE = path.join(__dirname, "subscribers.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

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

  if (cleanPhone.length === 10) {
    cleanPhone = "+91" + cleanPhone;
  } else if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
    cleanPhone = "+" + cleanPhone;
  } else if (!cleanPhone.startsWith("+")) {
    cleanPhone = "+" + cleanPhone;
  }

  const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
  if (!subscribers.includes(cleanPhone)) {
    subscribers.push(cleanPhone);
    fs.writeFileSync(DB_FILE, JSON.stringify(subscribers));
    console.log(`Successfully registered verified number: ${cleanPhone}`);
  }
  res.sendStatus(200);
});

// 3. Automation Cron: दर मिनिटाला चेक करेल आणि १० मिनिटे आधी मेसेज पाठवेल
cron.schedule("* * * * *", () => {
  const nowInIndia = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const futureOffset = new Date(nowInIndia.getTime() + 10 * 60000); 

  const targetHours = String(futureOffset.getHours()).padStart(2, "0");
  const targetMinutes = String(futureOffset.getMinutes()).padStart(2, "0");
  const timeMatchString = `${targetHours}:${targetMinutes}`;

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const currentDay = days[futureOffset.getDay()];

  if (currentDay === "SUN" || currentDay === "SAT") return;

  const currentSchedule = timetable[currentDay] || [];
  const upcomingLecture = currentSchedule.find((l) => l.start === timeMatchString);

  if (upcomingLecture) {
    const subscribers = JSON.parse(fs.readFileSync(DB_FILE));
    
    // 🛠️ बदल: BCA Alert ऐवजी Lecture Alert केलं आणि मेसेज शॉर्ट ठेवला
const alertMessage = 
  `Lecture start (In 10m) 🚀\n` +
  `Sub: ${upcomingLecture.subject}\n` +
  `Prof: ${upcomingLecture.teacher}\n` +
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
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Website engine online at port ${PORT}`)
);



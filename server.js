const express = require("express");
const cron = require("node-cron");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 1. Twilio API Credentials (तुझा ओरिजिनल टोकन इथेच राहू दे)
const TWILIO_ACCOUNT_SID = "AC_TWILIO_ACCOUNT_SID"; 
const TWILIO_AUTH_TOKEN = "1234 YOUR_TWILIO_AUTH_TOKEN";
// 📝 बदल: तुझ्या Twilio डॅशबोर्डवर असलेला फोन नंबर इथे टाक (उदा. +1234567890)
const TWILIO_PHONE_NUMBER = "+1XXXXXXXXXX"; 

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

const DB_FILE = path.join(__dirname, "subscribers.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify([]));

// 2. टाइमटेबल डेटा
const timetable = {
  MON: [
    { start: "10:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "11:00", subject: "Lab on Ecommerce", teacher: "Dr. Shailesh R. Thakare" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh" },
    { start: "13:45", subject: "Modern Operating System", teacher: "Prof. Rahul G. Nimbokar" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator" },
    { start: "16:00", subject: "Library Time", teacher: "Department Staff" },
  ],
  TUE: [
    { start: "10:00", subject: "Management Information System", teacher: "Dr. Shailesh R. Thakare" },
    { start: "11:00", subject: "Ecommerce", teacher: "Prof. Shekhar Todakar" },
    { start: "12:45", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "13:45", subject: "Lab on Modern Operating System", teacher: "Dr. Sonali Nimbhorkar" },
    { start: "15:00", subject: "Mini Project", teacher: "Project Coordinator" },
  ],
  WED: [
    { start: "10:00", subject: "Lab on Computer Graphics", teacher: "Dr. Vaibhav V. Thakare" },
    { start: "11:00", subject: "Advance Excel Lab", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "12:45", subject: "Computer Graphics", teacher: "Prof. Anuj S. Deshmukh" },
    { start: "13:45", subject: "Aptitude Training", teacher: "Sachin J. Deshpande" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More" },
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
    { start: "13:45", subject: "Advance Excel (Theory)", teacher: "Prof. Pranav A. Dhabarde" },
    { start: "15:00", subject: "Physical Education", teacher: "Dr. Amar More" },
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

// 3. Automation Cron: दर मिनिटाला चेक करेल (भारतीय वेळेनुसार)
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

    // 📝 बदल: SMS मध्ये व्हॉट्सॲप सारखे बोल्ड (*) फॉरमॅटिंग दिसत नाही, म्हणून साध्या टेक्स्टमध्ये मेसेज तयार केला आहे.
    const alertMessage =
      `GHRU Lecture Reminder (Starts in 10 mins)\n\n` +
      `Subject: ${upcomingLecture.subject}\n` +
      `Teacher: ${upcomingLecture.teacher}\n` +
      `Time: ${upcomingLecture.start}\n` +
      `Room: Class Room No. 105`;

    subscribers.forEach((phoneNum) => {
      // 📝 बदल: हा भाग आता डायरेक्ट नॉर्मल SMS पाठवेल
      client.messages
        .create({
          from: TWILIO_PHONE_NUMBER, // तुझा Twilio SMS नंबर
          to: phoneNum,             // विद्यार्थ्याचा नंबर (उदा. +91XXXXXXXXXX)
          body: alertMessage,
        })
        .then(() => console.log(`SMS Alert sent out to: ${phoneNum}`))
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
              

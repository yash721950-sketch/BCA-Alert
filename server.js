const express = require("express");
const cron = require("node-cron");
const path = require("path");
const mysql = require("mysql2"); 
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 🛢️ MySQL डेटाबेस कनेक्शन
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
      console.error("❌ MySQL डेटाबेस कनेक्शन फेल, पुन्हा प्रयत्न करत आहे...:", err.message);
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

let isBotReady = false;
let currentQrUrl = null;

// 🟢 WhatsApp Client Setup (टाईमआऊट फिक्ससह)
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, ".wwebjs_auth")
  }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: { 
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable', 
    timeout: 90000, // रेंडर स्लो असल्यामुळे टाईमआऊट ९० सेकंद केला
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ] 
  }
});

// QR कोड इव्हेंट
client.on("qr", (qr) => {
  console.log("📸 नवीन QR कोड जनरेट झाला आहे!");
  currentQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
});

// 🌐 QR कोड पाहण्यासाठी स्पेशल लिंक
app.get("/qr", (req, res) => {
  if (isBotReady) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2 style="color: green;">✅ WhatsApp Bot यशस्वीरित्या कनेक्टेड आहे!</h2>
        <p>आता स्कॅन करायची गरज नाही, बॉट चालू आहे भावा! 😎</p>
      </div>
    `);
  } else if (currentQrUrl) {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>📸 BCA Alert Bot - WhatsApp Login</h2>
        <p>तुझ्या मोबाईलच्या WhatsApp > Linked Devices मध्ये जाऊन हा QR कोड स्कॅन कर भावा:</p>
        <div style="margin: 20px auto; padding: 20px; border: 2px dashed #075E54; display: inline-block; background: #f9f9f9; border-radius: 10px;">
          <img src="${currentQrUrl}" alt="WhatsApp QR Code" style="width: 300px; height: 300px;" />
        </div>
        <p style="color: #666;">💡 टीप: ही लिंक दुसऱ्या फोनवर/लॅपटॉपवर उघडून स्वतःच्या फोनने QR स्कॅन कर.</p>
      </div>
    `);
  } else {
    res.send(`
      <div style="text-align: center; margin-top: 50px; font-family: Arial, sans-serif;">
        <h2>⏳ कृपया ३० सेकंद थांबा...</h2>
        <p>सर्व्हर सुरू होत आहे... पेज थोड्या वेळाने रिफ्रेश कर भावा.</p>
      </div>
    `);
  }
});

client.on("ready", () => {
  console.log("✅ WhatsApp Bot यशस्वीरित्या कनेक्ट झाला आहे आणि रेडी आहे! 🚀");
  isBotReady = true;
  currentQrUrl = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication फेल झालं:', msg);
  isBotReady = false;
});

client.on('disconnected', (reason) => {
  console.log('❌ WhatsApp डिसकनेक्ट झालं! पुन्हा कनेक्ट करत आहे...', reason);
  isBotReady = false;
  setTimeout(() => { client.initialize(); }, 5000);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception रोखली:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection रोखली:', reason);
});

client.initialize();

// ... (बाकीचा वेळापत्रक आणि क्रॉन जॉबचा कोड जसा आहे तसाच खाली राहील)

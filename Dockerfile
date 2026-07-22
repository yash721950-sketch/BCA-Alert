# Node.js 20 ची व्हेरी लाईटवेट (Alpine) इमेज
FROM node:20-alpine

# प्रोजेक्ट डिरेक्टरी सेट करणे
WORKDIR /app

# Dependencies कॉपी करून इन्स्टॉल करणे
COPY package*.json ./
RUN npm install --production

# पूर्ण कोड कॉपी करणे
COPY . .

# Render साठी 3000 पोर्ट ओपन ठेवणे
EXPOSE 3000

# सर्व्हर चालू करणे
CMD ["node", "server.js"]

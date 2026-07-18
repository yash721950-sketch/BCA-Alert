FROM ghcr.io/puppeteer/puppeteer:22.6.0

USER root

# प्रोजेक्ट डिरेक्टरी सेट करणे
WORKDIR /app

# लायब्ररीज इन्स्टॉल करणे
COPY package*.json ./
RUN npm ci

# पूर्ण कोड कॉपी करणे
COPY . .

# सर्व्हर चालू करणे
CMD ["node", "server.js"]

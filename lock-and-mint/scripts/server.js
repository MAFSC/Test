const fs = require("fs");
const https = require("https");
const express = require("express");

// Укажите пути к SSL-ключу и сертификату
const SSL_KEY_PATH = "./scripts/server.key";
const SSL_CERT_PATH = "./scripts/server.crt";

// Считываем ключ и сертификат
const privateKey = fs.readFileSync(SSL_KEY_PATH, "utf8");
const certificate = fs.readFileSync(SSL_CERT_PATH, "utf8");
const credentials = { key: privateKey, cert: certificate };

const app = express();

// Простой роут для проверки работы сервера
app.get("/", (req, res) => {
  res.send("Hello from HTTPS!");
});

// Создаём HTTPS-сервер и запускаем его на порту 3000
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(3000, "0.0.0.0", () => {
  console.log("HTTPS сервер запущен на порту 3000");
});

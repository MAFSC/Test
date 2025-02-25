const express = require("express");
const cors = require("cors");
const fs = require("fs");
const https = require("https");
const path = require("path");

const SSL_KEY_PATH = "./scripts/server.key";
const SSL_CERT_PATH = "./scripts/server.crt";

const privateKey = fs.readFileSync(SSL_KEY_PATH, "utf8");
const certificate = fs.readFileSync(SSL_CERT_PATH, "utf8");
const credentials = { key: privateKey, cert: certificate };

const app = express(); // Создаём приложение
app.use(cors());

// Маршрут для проверки работы сервера
app.get("/", (req, res) => {
  res.send("Hello from HTTPS!");
});

// Маршрут /lastMint возвращает данные о чеканке для указанного Ethereum-адреса
app.get("/lastMint", (req, res) => {
  // Файл с данными находится в папке data на уровень выше папки scripts
  const filePath = path.join(__dirname, "../data/oracleData.json");

  fs.readFile(filePath, "utf8", (err, fileData) => {
    if (err) {
      console.error("Ошибка чтения файла:", err);
      return res.status(500).json({ error: "Ошибка чтения данных о чеканке" });
    }
    let oracleData = {};
    if (fileData.trim() !== "") {
      try {
        const parsedData = JSON.parse(fileData);
        // Приводим все ключи в нижний регистр для корректного поиска
        for (const key in parsedData) {
          oracleData[key.toLowerCase()] = parsedData[key];
        }
      } catch (e) {
        console.error("Ошибка парсинга JSON:", e);
        return res.status(500).json({ error: "Ошибка парсинга данных" });
      }
    }
    const addr = (req.query.address || "").toLowerCase();
    if (addr && oracleData[addr]) {
      const d = oracleData[addr];
      const responseText =
`Пользователь: ${d.user}
Заблокировано (wei): ${d.depositAmount}
Sequence: ${d.sequence}
Токен-аккаунт (Solana): ${d.tokenAccount}
Подпись (Tx Signature): ${d.txSignature}
Ссылка на Solana Explorer: ${d.explorerUrl}`;
      res.send(responseText);
    } else {
      const fallbackText = `Данные для адреса ${req.query.address || ""} отсутствуют.`;
      res.send(fallbackText);
    }
  });
});

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(3000, "0.0.0.0", () => {
  console.log("HTTPS сервер запущен на порту 3000");
});




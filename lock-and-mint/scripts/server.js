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

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello from HTTPS!");
});

app.get("/lastMint", (req, res) => {
  const filePath = path.join(__dirname, "../data/oracleData.json");

  fs.readFile(filePath, "utf8", (err, fileData) => {
    if (err) {
      console.error("File read error:", err);
      return res.status(500).json({ error: "Error reading minting data" });
    }
    let oracleData = {};
    if (fileData.trim() !== "") {
      try {
        const parsedData = JSON.parse(fileData);
        // Convert all keys to lowercase
        for (const key in parsedData) {
          oracleData[key.toLowerCase()] = parsedData[key];
        }
      } catch (e) {
        console.error("JSON parsing error:", e);
        return res.status(500).json({ error: "Error parsing data" });
      }
    }
    // Get the address from the query parameter and convert it to lowercase
    const addr = (req.query.address || "").toLowerCase();
    if (addr && oracleData[addr]) {
      const d = oracleData[addr];
      let responseText = `User: ${d.user}\n` +
                         `Locked (wei): ${d.depositAmount}\n` +
                         `Sequence: ${d.sequence}\n` +
                         `Token Account (Solana): ${d.tokenAccount}\n`;
      if (d.mintAddress) {
        responseText += `Mint (Token Mint): ${d.mintAddress}\n`;
      }
      responseText += `Tx Signature: ${d.txSignature}\n` +
                      `Solana Explorer Link: ${d.explorerUrl}`;
      res.send(responseText);
    } else {
      const fallbackText = `No data available for address ${req.query.address || ""}.`;
      res.send(fallbackText);
    }
  });
});

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(3000, "0.0.0.0", () => {
  console.log("HTTPS server started on port 3000");
});

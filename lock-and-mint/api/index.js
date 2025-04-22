const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(cors());

// 1) Раздаём статику из папки root
const staticDir = path.join(__dirname, "../root");
app.use(express.static(staticDir));
app.get("/", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// 2) API /lastMint
app.get("/lastMint", (req, res) => {
  const filePath = path.join(__dirname, "../data/oracleData.json");
  fs.readFile(filePath, "utf8", (err, fileData) => {
    if (err) {
      console.error("File read error:", err);
      return res.status(500).json({ error: "Error reading minting data" });
    }
    let oracleData = {};
    if (fileData.trim()) {
      try {
        const parsed = JSON.parse(fileData);
        for (const k in parsed) oracleData[k.toLowerCase()] = parsed[k];
      } catch (parseErr) {
        console.error("JSON parse error:", parseErr);
        return res.status(500).json({ error: "Error parsing data" });
      }
    }
    const addr = (req.query.address || "").toLowerCase();
    if (addr && oracleData[addr]) {
      const d = oracleData[addr];
      let txt =
        `User: ${d.user}\n` +
        `Locked (wei): ${d.depositAmount}\n` +
        `Sequence: ${d.sequence}\n` +
        `Token Account (Solana): ${d.tokenAccount}\n`;
      if (d.mintAddress) txt += `Mint (Token Mint): ${d.mintAddress}\n`;
      txt +=
        `Tx Signature: ${d.txSignature}\n` +
        `Solana Explorer Link: ${d.explorerUrl}`;
      return res.send(txt);
    }
    res.send(`No data available for address ${req.query.address || ""}.`);
  });
});

// 3) Запуск HTTP‑сервера
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP server started on port ${PORT}`);
});


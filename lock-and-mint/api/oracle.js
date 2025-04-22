/**
 * Оракул для межцепочного взаимодействия между Ethereum и Solana.
 *
 * - Слушает событие ETHLocked на смарт-контракте Ethereum (через Alchemy WebSocket).
 * - При получении события создаёт (или использует) токен в Solana через SPL Token Program,
 *   чеканит (mint) токены в ассоциированный аккаунт.
 * - После успешной чеканки обновляет файл oracleData.json данными для данного Ethereum адреса.
 *
 * Зависимости:
 *   npm install web3 @solana/web3.js @solana/spl-token dotenv
 */

require('dotenv').config();

const Web3 = require('web3');
const { Connection, Keypair, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// =========== Настройки Ethereum (Alchemy на Sepolia) ===========
const ALCHEMY_WSS_URL = process.env.ALCHEMY_WSS_URL || 'wss://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY';
let provider = new Web3.providers.WebsocketProvider(ALCHEMY_WSS_URL);
let web3 = new Web3(provider);
const ethContractAddress = process.env.ETH_LOCK_CONTRACT || '0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6';
const ethContractABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "user",          "type": "address" },
      { "indexed": false, "name": "depositAmount", "type": "uint256" },
      { "indexed": false, "name": "sequence",      "type": "uint64" }
    ],
    "name": "ETHLocked",
    "type": "event"
  }
];
const ethContract = new web3.eth.Contract(ethContractABI, ethContractAddress);

// =========== Настройки Solana ===========
const solanaConnection = new Connection(clusterApiUrl('devnet'), 'confirmed');
const SOLANA_SECRET_KEY = process.env.SOLANA_SECRET_KEY;
if (!SOLANA_SECRET_KEY) {
  console.error('Ошибка: SOLANA_SECRET_KEY не задан.');
  process.exit(1);
}

let solanaKeypair;
try {
  const secretKeyArray = JSON.parse(SOLANA_SECRET_KEY);
  solanaKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
} catch (error) {
  console.error('Ошибка парсинга SOLANA_SECRET_KEY:', error);
  process.exit(1);
}

// =========== Инициализация токена ===========
let mintPublicKey;
const SPL_TOKEN_MINT = process.env.SPL_TOKEN_MINT || "";
async function initMintIfNeeded() {
  if (SPL_TOKEN_MINT) {
    mintPublicKey = new PublicKey(SPL_TOKEN_MINT);
    console.log("Используем существующий токен (mint):", mintPublicKey.toBase58());
  } else {
    console.log("Создаём новый токен (mint)...");
    mintPublicKey = await createMint(
      solanaConnection,
      solanaKeypair,
      solanaKeypair.publicKey,
      null,
      9 // decimals
    );
    console.log("Создан новый mint:", mintPublicKey.toBase58());
  }
}

// =========== Функция продажи токенов ===========
async function sellTokens(buyerPublicKey, amount) {
  try {
    const buyerPubKey = new PublicKey(buyerPublicKey);
    const sellerTokenAccount = await getOrCreateAssociatedTokenAccount(
      solanaConnection,
      solanaKeypair,
      mintPublicKey,
      solanaKeypair.publicKey
    );
    const buyerTokenAccount = await getOrCreateAssociatedTokenAccount(
      solanaConnection,
      solanaKeypair,
      mintPublicKey,
      buyerPubKey
    );

    const signature = await transfer(
      solanaConnection,
      solanaKeypair,
      sellerTokenAccount.address,
      buyerTokenAccount.address,
      solanaKeypair.publicKey,
      amount
    );

    console.log("Токены успешно проданы. Tx Signature:", signature);
    return signature;
  } catch (error) {
    console.error("Ошибка при продаже токенов:", error);
  }
}

// =========== Обновление файла oracleData.json ===========
const dataFilePath = path.join(__dirname, "../data/oracleData.json");
function updateOracleData(address, data) {
  let oracleData = {};
  if (fs.existsSync(dataFilePath)) {
    try {
      oracleData = JSON.parse(fs.readFileSync(dataFilePath, "utf8"));
    } catch (err) {
      console.error("Ошибка чтения oracleData.json:", err);
    }
  }
  oracleData[address.toLowerCase()] = data;
  fs.writeFileSync(dataFilePath, JSON.stringify(oracleData, null, 2), "utf8");
}

// =========== Запуск оракула ===========
console.log('Оракул запущен...');


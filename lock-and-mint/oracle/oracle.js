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

const Web3 = (require('web3').default || require('web3'));
const { Connection, Keypair, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, MintLayout } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');

// =========== Настройки Ethereum (Alchemy на Sepolia) ===========
const ALCHEMY_WSS_URL = 'wss://eth-sepolia.g.alchemy.com/v2/Kf7NZnpJ4fR7wicCOmHWLBuIGul6urV_';
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
  console.error('Переменная окружения SOLANA_SECRET_KEY не задана.');
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

// Инициализация мята (mint)
let mintPublicKey;
const SPL_TOKEN_MINT = process.env.SPL_TOKEN_MINT || "";
async function initMintIfNeeded() {
  if (SPL_TOKEN_MINT) {
    mintPublicKey = new PublicKey(SPL_TOKEN_MINT);
    console.log("Используем существующий токен (mint):", mintPublicKey.toBase58());
  } else {
    console.log("Создаём новый токен (mint), т.к. SPL_TOKEN_MINT не задан...");
    const decimals = 9;
    mintPublicKey = await createMint(
      solanaConnection,
      solanaKeypair,
      solanaKeypair.publicKey, // mintAuthority
      null,                    // freezeAuthority
      decimals
    );
    console.log("Новый mint создан:", mintPublicKey.toBase58());
    console.log("Сохраните этот адрес в .env как SPL_TOKEN_MINT, чтобы переиспользовать.");
  }
}

// =========== Функция обновления файла oracleData.json ===========
const dataFilePath = path.join(__dirname, "../data/oracleData.json");
function updateOracleData(address, data) {
  let oracleData = {};
  if (fs.existsSync(dataFilePath)) {
    try {
      const fileContent = fs.readFileSync(dataFilePath, "utf8");
      if (fileContent.trim() !== "") {
        oracleData = JSON.parse(fileContent);
      }
    } catch (err) {
      console.error("Ошибка чтения или парсинга oracleData.json:", err);
    }
  }
  // Приводим адрес к нижнему регистру
  oracleData[address.toLowerCase()] = data;
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(oracleData, null, 2), "utf8");
    console.log("Данные для адреса", address, "успешно обновлены в oracleData.json");
  } catch (err) {
    console.error("Ошибка записи в oracleData.json:", err);
  }
}

// =========== Функция чеканки токенов ===========
/**
 * Чеканит токены в Solana и обновляет oracleData.json.
 * @param {string} user - Ethereum адрес пользователя.
 * @param {string} depositAmount - сумма в wei.
 * @param {string} sequence - sequence события.
 */
async function mintTokensInSolana(user, depositAmount, sequence) {
  console.log(`Пользователь: ${user}, заблокировано: ${depositAmount}, sequence: ${sequence}`);
  console.log(`Чеканим токен для depositAmount=${depositAmount}, sequence=${sequence}`);

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    solanaConnection,
    solanaKeypair,
    mintPublicKey,
    solanaKeypair.publicKey
  );

  const decimals = 9;
  const mintedAmount = BigInt(depositAmount) / (10n ** (18n - BigInt(decimals)));
  const mintedAmountNumber = Number(mintedAmount);
  console.log(`Будем чеканить ~${mintedAmountNumber} субединиц (с учётом decimals=${decimals}).`);

  const signature = await mintTo(
    solanaConnection,
    solanaKeypair,
    mintPublicKey,
    tokenAccount.address,
    solanaKeypair.publicKey,
    mintedAmountNumber
  );

  console.log("Токены успешно выпущены в Solana. Токен-аккаунт:", tokenAccount.address.toBase58());
  console.log("Подпись (Tx Signature) для чеканки:", signature);
  console.log("Проверьте транзакцию на https://explorer.solana.com/tx/" + signature + "?cluster=devnet");

  const oracleRecord = {
    user: user,
    depositAmount: depositAmount,
    sequence: sequence,
    tokenAccount: tokenAccount.address.toBase58(),
    mintAddress: mintPublicKey.toBase58(), // добавляем mint address
    txSignature: signature,
    explorerUrl: "https://explorer.solana.com/tx/" + signature + "?cluster=devnet"
  };

  updateOracleData(user, oracleRecord);
}

// Функция продажи токенов
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
// =========== Мониторинг событий Ethereum ===========
function monitorEthereum() {
  console.log('Начало мониторинга события ETHLocked...');
  ethContract.events.ETHLocked({ fromBlock: 'latest' })
    .on('data', async (event) => {
      console.log('Обнаружено событие ETHLocked:', event.returnValues);
      const { user, depositAmount, sequence } = event.returnValues;
      try {
        await mintTokensInSolana(user, depositAmount, sequence);
      } catch (err) {
        console.error("Ошибка при чеканке токенов:", err);
      }
    })
    .on('error', (error) => {
      console.error('Ошибка при прослушивании события ETHLocked:', error);
    });
}

// =========== Логика переподключения WebSocket ===========
provider.on('connect', async () => {
  console.log('Подключение к Alchemy WebSocket на Sepolia установлено.');
  await initMintIfNeeded();
  monitorEthereum();
});

provider.on('error', (error) => {
  console.error('WebSocket error:', error);
});

provider.on('end', (error) => {
  console.error('WebSocket connection ended:', error, 'Reconnecting in 5s...');
  reconnectWebSocket();
});

function reconnectWebSocket() {
  setTimeout(() => {
    console.log('Reconnecting WebSocket...');
    provider = new Web3.providers.WebsocketProvider(ALCHEMY_WSS_URL);
    provider.on('connect', async () => {
      console.log('WebSocket reconnected.');
      web3.setProvider(provider);
      await initMintIfNeeded();
      monitorEthereum();
    });
    provider.on('error', (error) => {
      console.error('WebSocket error on reconnection:', error);
    });
    provider.on('end', (error) => {
      console.error('WebSocket ended on reconnection:', error, 'Attempting again...');
      reconnectWebSocket();
    });
  }, 5000);
}

// =========== Запуск оракула ===========
console.log('Оракул запущен. Подключаемся к Alchemy WebSocket для сети Sepolia...');

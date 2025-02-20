/**
 * Оракул для межцепочного взаимодействия между Ethereum и Solana.
 *
 * - Слушает событие ETHLocked на смарт-контракте Ethereum (через Alchemy WebSocket).
 * - При получении события создаёт (или использует) токен в Solana через SPL Token Program
 *   и чеканит (mint) токены в ассоциированный аккаунт.
 *
 * Зависимости:
 *   npm install web3 @solana/web3.js @solana/spl-token dotenv
 */

require('dotenv').config();

// =========== Импорты ===========

const Web3 = (require('web3').default || require('web3'));
const {
  Connection,
  Keypair,
  clusterApiUrl,
  PublicKey
} = require('@solana/web3.js');

const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo
} = require('@solana/spl-token');

// =========== Настройки Ethereum (Alchemy на Sepolia) ===========

// URL Alchemy для WebSocket (Sepolia)
const ALCHEMY_WSS_URL = 'wss://eth-sepolia.g.alchemy.com/v2/Kf7NZnpJ4fR7wicCOmHWLBuIGul6urV_';

// Создаём WebSocket-провайдер
let provider = new Web3.providers.WebsocketProvider(ALCHEMY_WSS_URL);
let web3 = new Web3(provider);

// Адрес контракта Ethereum, который эмитирует событие ETHLocked
const ethContractAddress = process.env.ETH_LOCK_CONTRACT || '0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6';

// ABI события ETHLocked
const ethContractABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "user",         "type": "address" },
      { "indexed": false, "name": "depositAmount","type": "uint256" },
      { "indexed": false, "name": "sequence",     "type": "uint64" }
    ],
    "name": "ETHLocked",
    "type": "event"
  }
];

const ethContract = new web3.eth.Contract(ethContractABI, ethContractAddress);

// =========== Настройки Solana ===========

// Подключаемся к devnet (или mainnet-beta)
const solanaConnection = new Connection(clusterApiUrl('devnet'), 'confirmed');

// Загружаем секретный ключ Solana (в формате JSON-массива чисел)
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

// Если у нас уже есть адрес минта, указываем в .env: SPL_TOKEN_MINT="..."
let mintPublicKey;
const SPL_TOKEN_MINT = process.env.SPL_TOKEN_MINT || "";

// =========== Создание/загрузка MINT ===========

async function initMintIfNeeded() {
  if (SPL_TOKEN_MINT) {
    // У нас уже есть токен. Используем его.
    mintPublicKey = new PublicKey(SPL_TOKEN_MINT);
    console.log("Используем существующий токен (mint):", mintPublicKey.toBase58());
  } else {
    // Создаём новый mint
    console.log("Создаём новый токен (mint), т.к. SPL_TOKEN_MINT не задан...");
    // decimals = 9 (часто используется в Solana)
    const decimals = 9;
    mintPublicKey = await createMint(
      solanaConnection,
      solanaKeypair,             // Плательщик
      solanaKeypair.publicKey,   // mintAuthority
      null,                      // freezeAuthority (null, если не нужно)
      decimals
    );
    console.log("Новый mint создан:", mintPublicKey.toBase58());
    console.log("Сохраните этот адрес в .env как SPL_TOKEN_MINT, чтобы переиспользовать.");
  }
}

// =========== Логика чеканки токена ===========

/**
 * Функция, которая чеканит токены при получении события из Ethereum.
 * @param {string} depositAmount - строка с числом в wei (например, "100000000000000")
 * @param {string} sequence - строка с sequence (например, "29")
 */
async function mintTokensInSolana(depositAmount, sequence) {
  console.log(`Чеканим токен для depositAmount=${depositAmount}, sequence=${sequence}`);

  // 1. Получаем (или создаём) ассоциированный токен-аккаунт для payer
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    solanaConnection,
    solanaKeypair,
    mintPublicKey,
    solanaKeypair.publicKey
  );

  // 2. Определяем, сколько токенов чеканить. 
  //    Допустим, 1:1 к "depositAmount" (но depositAmount в wei).
  //    Вы сами решаете логику конверсии. 
  //    Например, если decimals=9, нужно масштабировать. 
  //    Здесь для простоты делаем "wei / 1e9".
  //    (В реальном проекте аккуратно продумайте конверсию)
  const decimals = 9; 
  const mintedAmount = BigInt(depositAmount) / (10n ** (18n - BigInt(decimals)));
  const mintedAmountNumber = Number(mintedAmount);

  console.log(`Будем чеканить ~${mintedAmountNumber} субединиц (с учётом decimals=${decimals}).`);

  // 3. Чеканим
  //    Функция mintTo(...) возвращает подпись транзакции (TransactionSignature).
  const signature = await mintTo(
    solanaConnection,
    solanaKeypair,               // Плательщик
    mintPublicKey,               // Mint
    tokenAccount.address,        // Куда чеканить
    solanaKeypair.publicKey,     // mintAuthority
    mintedAmountNumber           // Кол-во субединиц
  );

  console.log("Токены успешно выпущены в Solana. Токен-аккаунт:", tokenAccount.address.toBase58());
  console.log("Подпись (Tx Signature) для чеканки:", signature);
  console.log("Проверьте транзакцию на https://explorer.solana.com/tx/" + signature + "?cluster=devnet");
}

// =========== Мониторинг событий Ethereum ===========

function monitorEthereum() {
  console.log('Начало мониторинга события ETHLocked...');
  ethContract.events.ETHLocked({ fromBlock: 'latest' })
    .on('data', async (event) => {
      console.log('Обнаружено событие ETHLocked:', event.returnValues);
      const { user, depositAmount, sequence } = event.returnValues;
      console.log(`Пользователь: ${user}, заблокировано: ${depositAmount}, sequence: ${sequence}`);

      // Вызываем чеканку токенов в Solana
      try {
        await mintTokensInSolana(depositAmount, sequence);
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
  // Сначала инициализируем (или загружаем) mint, затем подписываемся
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




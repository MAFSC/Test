/**
 * oracle/oracle.js
 *
 * 1) Подписывается на событие ETHLocked (Sepolia, WebSocket Alchemy).
 * 2) По событию:
 *    – запрашивает курс ETH→USD у CoinMarketCap
 *    – вычисляет tokens = floor( (depositETH * priceUSD) / 0.1 )
 *    – чеканит на Solana tokens токенов с decimals=9
 * 3) Кэширует последнюю чеканку и отдаёт в /lastMint
 *
 * Зависимости:
 *   npm i web3 @solana/web3.js @solana/spl-token express cors dotenv node-fetch@2
 */

require('dotenv').config();

const Web3 = require('web3');
const fetch = require('node-fetch');
const {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} = require('@solana/web3.js');
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require('@solana/spl-token');

const fs      = require('fs');
const path    = require('path');
const express = require('express');
const cors    = require('cors');

// ───────────────────────── ENV ─────────────────────────
const {
  ALCHEMY_WSS_URL,        // wss://eth-sepolia.g.alchemy.com/v2/XXX
  ETH_LOCK_CONTRACT,      // 0x… ваш контракт
  SOLANA_SECRET_KEY,      // JSON-массив приватного ключа (64 байта)
  SPL_TOKEN_MINT,         // (опционально) готовый mintPubkey
  PORT = 3000,            // порт для Express
  COINMARKETCAP_API_KEY   // ваш ключ CoinMarketCap
} = process.env;

if (!ALCHEMY_WSS_URL || !ETH_LOCK_CONTRACT || !SOLANA_SECRET_KEY || !COINMARKETCAP_API_KEY) {
  console.error('❌ .env должен содержать ALCHEMY_WSS_URL, ETH_LOCK_CONTRACT, SOLANA_SECRET_KEY, COINMARKETCAP_API_KEY');
  process.exit(1);
}

// ───────────────────────── ETHEREUM ─────────────────────────
const ethProvider = new Web3.providers.WebsocketProvider(ALCHEMY_WSS_URL, {
  clientConfig: { keepalive: true, keepaliveInterval: 60000 }
});
const web3 = new Web3(ethProvider);
const ETH_LOCK_ABI = [{
  anonymous: false,
  inputs: [
    { indexed:true,  name:'user',          type:'address' },
    { indexed:false, name:'depositAmount', type:'uint256' },
    { indexed:false, name:'sequence',      type:'uint64'  }
  ],
  name:'ETHLocked',
  type:'event'
}];
const ethLock = new web3.eth.Contract(ETH_LOCK_ABI, ETH_LOCK_CONTRACT);

// ───────────────────────── SOLANA ─────────────────────────
const solConnection = new Connection(clusterApiUrl('devnet'), 'confirmed');
let oracleKeypair;
try {
  oracleKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(SOLANA_SECRET_KEY))
  );
} catch (e) {
  console.error('❌ Не удалось распарсить SOLANA_SECRET_KEY:', e.message);
  process.exit(1);
}

let mintPubkey;
async function initMint() {
  if (SPL_TOKEN_MINT) {
    mintPubkey = new PublicKey(SPL_TOKEN_MINT);
    console.log('✔ Используем существующий mint:', mintPubkey.toBase58());
  } else {
    console.log('⏳ Создаём новый mint…');
    mintPubkey = await createMint(
      solConnection,
      oracleKeypair,
      oracleKeypair.publicKey,
      null,
      9       // decimals
    );
    console.log('✔ Новый mint создан:', mintPubkey.toBase58(),
      '\n   Добавьте его в .env как SPL_TOKEN_MINT для reuse');
  }
}

// ──────────────────── Кэш последней чеканки ────────────────────
const cacheFile = path.join(__dirname, '../data/oracleLast.json');
let lastMint = {};
if (fs.existsSync(cacheFile)) {
  try { lastMint = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
}
function saveLast() {
  fs.writeFileSync(cacheFile, JSON.stringify(lastMint, null, 2));
}

// ──────────────────── CoinMarketCap API ────────────────────
const TOKEN_PRICE_USDC = 0.1;  // стоимость одного вашего токена
async function fetchEthPrice() {
  const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH&convert=USD';
  const resp = await fetch(url, {
    headers: { 'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY }
  });
  if (!resp.ok) throw new Error(`CMC ${resp.status}`);
  const j = await resp.json();
  return j.data.ETH.quote.USD.price;
}

// ──────────────────── Обработка события ────────────────────
async function handleEthLocked({ user, depositAmount, sequence }) {
  console.log(`🔔 ETHLocked: user=${user} wei=${depositAmount} seq=${sequence}`);

  // 1) получаем price USD
  let price;
  try {
    price = await fetchEthPrice();
    console.log('   ETH price:', price, 'USD');
  } catch (e) {
    return console.error('❌ Ошибка price fetch:', e.message);
  }

  // 2) считаем сколько токенов чеканить
  const depositWei = BigInt(depositAmount);
  const depositEth = Number(depositWei) / 1e18;
  const depositUsd = depositEth * price;
  const tokens     = Math.floor(depositUsd / TOKEN_PRICE_USDC);
  console.log('   Mint tokens:', tokens);

  // 3) получаем ATA для oracle → mintPubkey (decimals=9)
  const ata = await getOrCreateAssociatedTokenAccount(
    solConnection,
    oracleKeypair,
    mintPubkey,
    oracleKeypair.publicKey
  );
  const subunits = tokens * 10 ** 9;
  console.log('   Mint subunits:', subunits, 'to', ata.address.toBase58());

  // 4) чеканим
  let sig;
  try {
    sig = await mintTo(
      solConnection,
      oracleKeypair,
      mintPubkey,
      ata.address,
      oracleKeypair.publicKey,
      subunits
    );
  } catch (e) {
    return console.error('❌ Ошибка mintTo:', e.message);
  }

  // 5) сохраняем в кэш и лог
  lastMint = {
    user: user.toLowerCase(),
    depositAmount,
    sequence: sequence.toString(),
    tokenAmount: tokens.toString(),
    tokenAccount: ata.address.toBase58(),
    mintAddress:  mintPubkey.toBase58(),
    txSignature:  sig,
    explorerUrl:  `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    timestamp:    Date.now(),
  };
  saveLast();
  console.log('✔ Mint OK →', sig);
}

// ──────────────────── Подписка на ETH ────────────────────
function watchEth() {
  console.log('⏳ Подписываемся на ETHLocked…');
  ethLock.events.ETHLocked({ fromBlock: 'latest' })
    .on('data', ev => handleEthLocked(ev.returnValues))
    .on('error', err => console.error('WS-ETH error:', err.message));
}
ethProvider.on('connect', () => console.log('🟢 WS ETH connected'));
ethProvider.on('error',   e => console.error('WS ETH error:', e.message));

// ──────────────────── Express API ────────────────────
const app = express();
app.use(cors());
app.get('/lastMint', (_req, res) => res.json(lastMint));

app.listen(PORT, async () => {
  console.log(`🚀 Oracle API listening on port ${PORT}`);
  await initMint();
  watchEth();
});

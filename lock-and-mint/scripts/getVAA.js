require("dotenv").config();
const { ethers } = require("hardhat");
const { Buffer } = require("buffer");
const { Interface } = require("ethers");

// Динамический импорт fetch для работы с ESM-модулем node-fetch
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

// Импортируем функцию для получения VAA из Wormhole SDK
const { getSignedVaaWithRetry } = require("@wormhole-foundation/sdk");

// Helper: вычисляет emitter address в 32-байтовом формате на основе адреса Wormhole
function getEmitterAddressEth(address) {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

// Helper: извлекает sequence из receipt, ищем событие ETHLocked, эмитированное контрактом ETHLock
function parseSequenceFromLogEth(receipt, ethLockAddress) {
  const iface = new Interface([
    "event ETHLocked(address indexed user, uint256 depositAmount, uint64 sequence)"
  ]);
  
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === ethLockAddress.toLowerCase()) {
      try {
        const parsedLog = iface.parseLog(log);
        return parsedLog.args.sequence;
      } catch (err) {
        continue;
      }
    }
  }
  throw new Error("ETHLocked event not found in receipt");
}

async function main() {
  // Подключаем контракт ETHLock по адресу из .env
  const ethLock = await ethers.getContractAt("ETHLock", process.env.ETH_LOCK_CONTRACT);
  console.log("📡 ETHLock контракт:", process.env.ETH_LOCK_CONTRACT);
  
  // Отправляем lockETH-транзакцию с 0.0002 ETH (при fee = 0.0001 ETH, депозит = 0.0001 ETH)
  console.log("🚀 Отправка lockETH транзакции с 0.0002 ETH...");
  const txResponse = await ethLock.lockETH({ value: ethers.parseEther("0.0002") });
  const receipt = await txResponse.wait();
  console.log("✅ lockETH TX hash:", receipt.transactionHash);
  
  // Вычисляем emitter address на основе адреса Wormhole из .env
  const emitterAddress = getEmitterAddressEth(process.env.WORMHOLE_ETH_ADDRESS);
  console.log("🟢 Emitter Address:", emitterAddress);
  
  // Извлекаем sequence из receipt (ищем событие ETHLocked, эмитированное ETHLock)
  const sequence = parseSequenceFromLogEth(receipt, process.env.ETH_LOCK_CONTRACT);
  console.log("🔢 Sequence:", sequence.toString());
  
  // Определяем emitterChain.
  // Для Ethereum в Wormhole обычно используется chain id = 2.
  const emitterChain = 2;
  
  // Запрашиваем подписанный VAA через API Wormhole
  const url = `https://wormhole-v2-mainnet-api.mcf.rocks/v1/signed_vaa/${emitterChain}/${emitterAddress}/${sequence.toString()}`;
  console.log("🔗 Запрос VAA по URL:", url);
  const response = await fetch(url);
  const data = await response.json();
  if (data.code !== 0) {
    throw new Error(`Ошибка API: ${data.message}`);
  }
  
  // Предполагаем, что ответ содержит поле vaaBytes в виде строки
  const vaaHex = data.vaaBytes.startsWith("0x") ? data.vaaBytes : "0x" + data.vaaBytes;
  console.log("🟢 Полученный VAA_HEX:", vaaHex);
}

main().catch((error) => {
  console.error("❌ Ошибка при получении VAA:", error);
});




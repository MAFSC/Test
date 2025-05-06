require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  // Задайте адреса контрактов (замените на актуальные, если нужно)
  const ethLockAddress = "0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6";
  const wormholeAddress = "0xE7AD9BbD945c84E9aa4db6D5FD68FebC516aEA0C";
  
  // Подключаем контракты
  const ethLock = await ethers.getContractAt("ETHLock", ethLockAddress);
  const wormhole = await ethers.getContractAt("Wormhole", wormholeAddress);

  console.log("📡 ETHLock адрес:", ethLockAddress);
  console.log("📡 Wormhole адрес:", wormholeAddress);

  // Вызов lockETH с суммой 0.0002 ETH (из которых 0.0001 ETH пойдут как комиссия)
  console.log("🚀 Отправка lockETH транзакции с 0.0002 ETH...");
  const txLock = await ethLock.lockETH({ value: ethers.parseEther("0.0002") });
  const receiptLock = await txLock.wait();
  console.log("✅ lockETH транзакция:", receiptLock.transactionHash);

  // Проверка заблокированного ETH
  const locked = await ethLock.getLockedBalance();
  console.log("🔒 Заблокированный ETH (lockedEth):", ethers.formatEther(locked), "ETH");

  // Проверка логов Wormhole: количество сообщений и последнее сообщение
  const msgCount = await wormhole.messageCount();
  console.log("📡 Количество сообщений в Wormhole:", msgCount.toString());
  
  if (msgCount > 0n) {
    const lastIndex = msgCount - 1n;
    const lastMessage = await wormhole.messages(lastIndex);
    console.log("📜 Последнее сообщение в Wormhole:", lastMessage);
  } else {
    console.log("⚠️ Сообщений в Wormhole пока нет.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
  });

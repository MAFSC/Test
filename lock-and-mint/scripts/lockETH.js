// scripts/lockETH.js

// Импортируем ethers из Hardhat
const { ethers } = require("hardhat");

async function main() {
  // Укажите адрес задеплоенного контракта ETHLock на Sepolia
  const contractAddress = "0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6";

  // Получаем аккаунт для подписания (из списка Signers Hardhat)
  const [deployer] = await ethers.getSigners();
  console.log("👤 Используем аккаунт:", deployer.address);

  // Создаём экземпляр контракта ETHLock
  // Важно, чтобы "ETHLock" совпадало с именем контракта в Solidity
  const contract = await ethers.getContractAt("ETHLock", contractAddress);

  try {
    // Сумма для блокировки (0.0002 ETH)
    const amount = ethers.parseEther("0.0002");
    console.log(`🔒 Отправляем ${ethers.formatEther(amount)} ETH в lockETH()...`);

    // Вызываем функцию lockETH() с передачей 0.0002 ETH
    const tx = await contract.lockETH({ value: amount });
    console.log("⏳ Транзакция отправлена:", tx.hash);

    // Ожидаем подтверждения
    const receipt = await tx.wait();
    console.log("✅ Транзакция завершена:", receipt.transactionHash);
  } catch (error) {
    // Если произошёл revert в смарт-контракте, выведем причину
    console.error("❌ Ошибка при вызове lockETH:", error.reason || error.message);
  }
}

// Запуск скрипта через npx hardhat
main().catch((error) => {
  console.error("❌ Ошибка в скрипте:", error);
  process.exit(1);
});

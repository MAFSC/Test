const { ethers } = require("hardhat"); // ✅ Верный импорт для Hardhat

async function main() {
  const contractAddress = "0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6"; // Адрес контракта
  const [deployer] = await ethers.getSigners(); // Получаем адрес кошелька

  console.log(`👤 Используем аккаунт: ${deployer.address}`);

  // Получаем контракт по адресу
  const contract = await ethers.getContractAt("ETHLock", contractAddress);

  // Подготовка суммы для блокировки
  const amountToLock = ethers.parseEther("0.0001"); // ✅ parseEther вместо utils.parseEther

  console.log(`🔒 Блокируем ${ethers.formatEther(amountToLock)} ETH...`);
  const tx = await contract.lockETH({ value: amountToLock });
  console.log(`⏳ Транзакция отправлена: ${tx.hash}`);
  
  // Ожидаем завершения транзакции
  const receipt = await tx.wait();
  console.log(`✅ Транзакция завершена. Статус: ${receipt.status}`);

  // Получаем текущий баланс заблокированных ETH
  const lockedBalance = await contract.getLockedBalance();
  console.log(`🔹 Заблокировано ETH: ${ethers.formatEther(lockedBalance)} ETH`);
}

// Запуск скрипта
main().catch((error) => {
  console.error("❌ Ошибка в скрипте:", error);
  process.exitCode = 1;
});



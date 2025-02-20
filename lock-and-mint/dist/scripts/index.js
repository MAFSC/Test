"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hardhat_1 = require("hardhat");
async function main() {
    const contractAddress = "0x0eB67891844D2Cc33aB583A1a472D0cFd9a942FB"; // Адрес контракта
    const [deployer] = await hardhat_1.ethers.getSigners(); // Получаем адрес текущего кошелька
    // Получаем контракт по адресу
    const contract = await hardhat_1.ethers.getContractAt("ETHLock", contractAddress);
    // Пример вызова метода блокировки ETH
    const amountToLock = hardhat_1.ethers.utils.parseEther("0.0001"); // Сумма в ETH для блокировки (например, 0.001 ETH)
    console.log(`Блокируем ${hardhat_1.ethers.utils.formatEther(amountToLock)} ETH...`);
    const tx = await contract.lockETH({ value: amountToLock });
    console.log(`Транзакция отправлена: ${tx.hash}`);
    // Ожидаем завершения транзакции
    const receipt = await tx.wait();
    console.log(`Транзакция завершена с результатом: ${receipt.status}`);
    // Пример вызова функции для получения заблокированного баланса
    const lockedBalance = await contract.getLockedBalance();
    console.log(`Заблокировано всего ETH: ${hardhat_1.ethers.utils.formatEther(lockedBalance)} ETH`);
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
//# sourceMappingURL=index.js.map
// scripts/lockFunds.js
async function main() {
    // Получаем подписанта (аккаунт) из Hardhat
    const [deployer] = await ethers.getSigners();
    console.log("Используем аккаунт:", deployer.address);
  
    // Получаем экземпляр контракта по адресу из переменной окружения
    const LockFunds = await ethers.getContractFactory("LockFunds");
    const lockFundsContract = LockFunds.attach(process.env.ETH_LOCK_CONTRACT);
  
    // Вызываем функцию блокировки, отправляя, например, 0.01 ETH
    console.log("Отправляем транзакцию для блокировки средств...");
    const tx = await lockFundsContract.lockFunds({ value: ethers.utils.parseEther("0.0001") });
    console.log("Хэш транзакции:", tx.hash);
    await tx.wait();
    console.log("Средства заблокированы!");
  }
  
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
  
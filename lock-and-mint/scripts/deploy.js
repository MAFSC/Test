require("dotenv").config();
const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners(); // Получаем первый аккаунт

    console.log(`🔹 Деплой от имени: ${deployer.address}`);

    // Получаем фабрику контракта
    const ContractFactory = await hre.ethers.getContractFactory("ETHLock");
    
    // Разворачиваем контракт с параметрами (Wormhole и владелец)
    const contract = await ContractFactory.deploy(process.env.WORMHOLE_ETH_ADDRESS, deployer.address);

    await contract.waitForDeployment();
    console.log(`✅ Контракт ETHLock развернут по адресу: ${contract.target}`);
}

main().catch((error) => {
    console.error("❌ Ошибка при развертывании:", error);
    process.exitCode = 1;
});

const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("🚀 Деплоим контракт с аккаунта:", deployer.address);

    // Проверяем баланс деплойера
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("💰 Баланс деплойера:", ethers.formatEther(balance), "ETH");

    // Компилируем контракт
    const Wormhole = await ethers.getContractFactory("Wormhole");
    const wormhole = await Wormhole.deploy(deployer.address);

    // Ждем завершения деплоя
    await wormhole.waitForDeployment();

    console.log("✅ Контракт Wormhole задеплоен по адресу:", wormhole.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Ошибка при деплое:", error);
        process.exit(1);
    });

    
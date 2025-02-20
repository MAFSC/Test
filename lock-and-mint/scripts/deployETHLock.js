// scripts/deployETHLock.js

require("dotenv").config();
const { ethers } = require("hardhat");

async function main() {
  // Считываем адрес Wormhole из .env
  const wormholeAddress = process.env.WORMHOLE_ETH_ADDRESS;
  if (!wormholeAddress || wormholeAddress === "") {
    throw new Error("WORMHOLE_ETH_ADDRESS не задан в .env");
  }

  // Получаем аккаунт для деплоя
  const [deployer] = await ethers.getSigners();
  console.log("Деплой с аккаунта:", deployer.address);

  // Проверяем баланс через ethers.provider
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Баланс деплойера:", ethers.utils.formatEther(balance), "ETH");

  // Готовим фабрику контракта
  const ETHLock = await ethers.getContractFactory("ETHLock");

  // Деплоим контракт, передавая адрес Wormhole и адрес владельца
  console.log("Деплой ETHLock...");
  const ethLock = await ETHLock.deploy(wormholeAddress, deployer.address);

  console.log("Ожидаем подтверждения деплоя...");
  await ethLock.waitForDeployment();

  // В ethers v6 вместо .address используем .getAddress() или .target
  const contractAddress = await ethLock.getAddress();

  console.log("Контракт ETHLock задеплоен по адресу:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

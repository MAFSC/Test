require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true, // Включаем оптимизацию
        runs: 200 // Оптимизация под 200 запусков (используется для снижения газа)
      }
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/Kf7NZnpJ4fR7wicCOmHWLBuIGul6urV_", // Используем RPC из .env или дефолтный
      accounts: process.env.ETH_PRIVATE_KEY 
        ? [process.env.ETH_PRIVATE_KEY] 
        : (console.error("⚠️ ETH_PRIVATE_KEY не найден в .env"), []), // Вывод ошибки, если ключ отсутствует
      chainId: 11155111 // Chain ID сети Sepolia
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "Y5YK2XTJJXFSBSFC5SBW9IA9W9C8NJ43PU" // API-ключ Etherscan для верификации
  }
};




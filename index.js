require('dotenv').config();
const { ethers } = require('ethers');
const { Connection, Keypair } = require('@solana/web3.js');
const {
    getEmitterAddressEth,
    parseSequenceFromLogEth,
    getSignedVAAWithRetry,
    redeemOnSolana
} = require('@wormhole-foundation/sdk');

// Инициализация Ethereum провайдера и кошелька
const ethProvider = new ethers.providers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const ethWallet = new ethers.Wallet(process.env.ETH_PRIVATE_KEY, ethProvider);

// Инициализация Solana соединения и кошелька
const solConnection = new Connection('https://api.devnet.solana.com');
const solWallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOL_PRIVATE_KEY)));

// Адреса контрактов Wormhole и LockAndMint
const WORMHOLE_ETH_ADDRESS = process.env.WORMHOLE_ETH_ADDRESS;
const WORMHOLE_SOL_ADDRESS = process.env.WORMHOLE_SOL_ADDRESS;
const LOCK_AND_MINT_CONTRACT_ADDRESS = process.env.LOCK_AND_MINT_CONTRACT_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

// ABI для взаимодействия с контрактом LockAndMint
const lockAndMintABI = [
    "function lockTokens(uint256 amount, uint256 lockTime) external",
];

// ABI для взаимодействия с ERC-20 токенами
const erc20ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)",
];

// Функция для блокировки токенов и выпуска их на Solana
async function lockAndMint(amount, lockTime) {
    try {
        const contract = new ethers.Contract(LOCK_AND_MINT_CONTRACT_ADDRESS, lockAndMintABI, ethWallet);
        const token = new ethers.Contract(TOKEN_ADDRESS, erc20ABI, ethWallet);

        // 1. Проверяем и одобряем контракт на списание токенов
        console.log("Проверяем разрешение на списание токенов...");
        let allowance = await token.allowance(ethWallet.address, LOCK_AND_MINT_CONTRACT_ADDRESS);
        if (allowance.lt(amount)) {
            console.log(`Одобряем контракту LockAndMint доступ к ${ethers.utils.formatEther(amount)} токенам...`);
            const approveTx = await token.approve(LOCK_AND_MINT_CONTRACT_ADDRESS, amount);
            await approveTx.wait();
            console.log("Одобрение выполнено.");
        }

        // 2. Блокировка токенов в контракте LockAndMint.sol
        console.log(`Блокируем ${ethers.utils.formatEther(amount)} токенов на ${lockTime} секунд...`);
        const tx = await contract.lockTokens(amount, lockTime);
        const receipt = await tx.wait();
        console.log(`Токены заблокированы! Транзакция: ${receipt.transactionHash}`);

        // 3. Получаем VAA (Verified Action Approval) от Wormhole
        console.log("Получаем VAA от Wormhole...");
        const emitterAddress = getEmitterAddressEth(WORMHOLE_ETH_ADDRESS);
        const sequence = await parseSequenceFromLogEth(receipt, WORMHOLE_ETH_ADDRESS);
        const { vaaBytes } = await getSignedVAAWithRetry(
            ['https://wormhole-v2-testnet-api.certus.one'],
            'ethereum',
            emitterAddress,
            sequence
        );
        console.log("VAA получено!");

        // 4. Выпускаем токены на Solana
        console.log("Выпускаем токены на Solana...");
        await redeemOnSolana(solConnection, WORMHOLE_SOL_ADDRESS, vaaBytes, solWallet.publicKey);
        console.log(`Успешно выпущено ${ethers.utils.formatEther(amount)} токенов на Solana!`);
    } catch (error) {
        console.error("Ошибка при блокировке и выпуске токенов:", error);
        throw error; // Прокидываем ошибку дальше для возможного логирования
    }
}

// Пример использования: блокируем 10 токенов на 1 час (3600 секунд)
const AMOUNT = ethers.utils.parseEther("10"); // 10 токенов
const LOCK_TIME = 3600; // 1 час

lockAndMint(AMOUNT, LOCK_TIME).catch(console.error);

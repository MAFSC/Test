require("dotenv").config();
const { JsonRpcProvider, Wallet, Contract, parseEther } = require("ethers");
const { Connection, Keypair } = require("@solana/web3.js");
const {
    getEmitterAddressEth,
    parseSequenceFromLogEth,
    getSignedVAAWithRetry,
    redeemOnSolana
} = require("@wormhole-foundation/sdk");

// ✅ Отладочный вывод перед разбором SOL_PRIVATE_KEY
console.log("DEBUG: SOL_PRIVATE_KEY =", process.env.SOL_PRIVATE_KEY);

// ✅ Загрузка приватного ключа Solana
let solSecretKey;
try {
    if (process.env.SOL_PRIVATE_KEY.startsWith("[") && process.env.SOL_PRIVATE_KEY.endsWith("]")) {
        solSecretKey = JSON.parse(process.env.SOL_PRIVATE_KEY);
    } else {
        throw new Error("SOL_PRIVATE_KEY должен быть JSON-массивом.");
    }

    if (!Array.isArray(solSecretKey)) {
        throw new Error("SOL_PRIVATE_KEY не является массивом.");
    }
} catch (error) {
    console.error("❌ Ошибка с SOL_PRIVATE_KEY:", error.message);
    console.error("Проверьте .env файл!");
    process.exit(1);
}

// ✅ Инициализация Ethereum провайдера и кошелька
const ethProvider = new JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const ethWallet = new Wallet(process.env.ETH_PRIVATE_KEY, ethProvider);

// ✅ Инициализация Solana соединения и кошелька
const solConnection = new Connection(process.env.SOLANA_RPC_URL);
const solWallet = Keypair.fromSecretKey(Uint8Array.from(solSecretKey));

// ✅ Адреса контрактов
const WORMHOLE_ETH_ADDRESS = process.env.WORMHOLE_ETH_ADDRESS;
const WORMHOLE_SOL_ADDRESS = process.env.WORMHOLE_SOL_ADDRESS;
const LOCK_AND_MINT_CONTRACT_ADDRESS = process.env.LOCK_AND_MINT_CONTRACT_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

// ✅ ABI для контракта LockAndMint.sol
const lockAndMintABI = [
    "function lockTokens(uint256 amount, uint256 lockTime) external"
];

// ✅ ABI для ERC-20 токена
const erc20ABI = [
    "function approve(address spender, uint256 amount) public returns (bool)",
    "function allowance(address owner, address spender) public view returns (uint256)"
];

// ✅ Функция блокировки токенов и выпуска на Solana
async function lockAndMint(amount, lockTime) {
    const contract = new Contract(LOCK_AND_MINT_CONTRACT_ADDRESS, lockAndMintABI, ethWallet);
    const token = new Contract(TOKEN_ADDRESS, erc20ABI, ethWallet);

    console.log(`🔹 Ethereum-кошелек: ${ethWallet.address}`);
    console.log(`🔹 Solana-кошелек: ${solWallet.publicKey.toBase58()}`);

    // ✅ 1. Проверяем и одобряем контракту LockAndMint списание токенов
    let allowance = await token.allowance(ethWallet.address, LOCK_AND_MINT_CONTRACT_ADDRESS);
    if (allowance < amount) {
        console.log("🔹 Одобряем контракту LockAndMint доступ к токенам...");
        const approveTx = await token.approve(LOCK_AND_MINT_CONTRACT_ADDRESS, amount);
        await approveTx.wait();
        console.log("✅ Одобрение выполнено.");
    }

    // ✅ 2. Блокировка токенов в контракте LockAndMint.sol
    console.log(`🔹 Блокируем ${parseEther(amount.toString())} токенов на ${lockTime} секунд...`);
    const tx = await contract.lockTokens(parseEther(amount.toString()), lockTime);
    const receipt = await tx.wait();
    console.log(`✅ Токены заблокированы! Транзакция: ${receipt.hash}`);

    // ✅ 3. Получение VAA (Verified Action Approval) от Wormhole
    console.log("🔹 Получаем VAA от Wormhole...");
    const emitterAddress = getEmitterAddressEth(WORMHOLE_ETH_ADDRESS);
    const sequence = await parseSequenceFromLogEth(receipt, WORMHOLE_ETH_ADDRESS);
    const { vaaBytes } = await getSignedVAAWithRetry(
        ["https://wormhole-v2-testnet-api.certus.one"],
        "ethereum",
        emitterAddress,
        sequence
    );
    console.log("✅ VAA получено!");

    // ✅ 4. Выпуск токенов в Solana
    console.log("🔹 Выпускаем токены на Solana...");
    await redeemOnSolana(solConnection, WORMHOLE_SOL_ADDRESS, vaaBytes, solWallet.publicKey);
    console.log(`✅ Успешно выпущено ${amount} токенов на Solana!`);
}

// ✅ Запуск: блокируем 10 токенов на 1 час (3600 секунд)
const AMOUNT = 10; // 10 токенов
const LOCK_TIME = 3600; // 1 час

lockAndMint(AMOUNT, LOCK_TIME).catch(console.error);

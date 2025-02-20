require("dotenv").config();
const { ethers } = require("hardhat");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { getSignedVAAWithRetry, parseSequenceFromLogEth, getEmitterAddressEth } = require("@wormhole-foundation/sdk");
const { getParsedTokenAccountsByOwner } = require("@solana/spl-token");
const { Buffer } = require("buffer");

async function main() {
  // === ЭТАП 1: Ethereum ===
  // Подключаем контракт ETHLock по адресу из .env (обновите переменную, если нужно)
  const ethLock = await ethers.getContractAt("ETHLock", process.env.ETH_LOCK_CONTRACT);
  console.log("📡 ETHLock контракт:", ethLock.address);

  // Вызываем lockETH() с суммой 0.0002 ETH (при fee = 0.0001 ETH, депозит = 0.0001 ETH)
  console.log("🚀 Отправка lockETH транзакции...");
  const txResponse = await ethLock.lockETH({ value: ethers.parseEther("0.0002") });
  const receipt = await txResponse.wait();
  console.log("✅ lockETH TX hash:", receipt.transactionHash);

  // Получение VAA происходит автоматически, если SDK настроен.
  // Попробуем извлечь emitter address и sequence из receipt.
  // Если эти функции не работают, воспользуйтесь VAA, полученным вручную, и сохраните его в VAA_HEX.
  let vaaHex = process.env.VAA_HEX;
  if (!vaaHex || vaaHex === "") {
    // Если VAA не задан, пробуем получить его через SDK.
    // Если SDK не возвращает функции, этот блок можно закомментировать, и использовать VAA из .env.
    const emitterAddress = getEmitterAddressEth(process.env.WORMHOLE_ETH_ADDRESS);
    console.log("🟢 Emitter Address:", emitterAddress);
  
    const sequence = parseSequenceFromLogEth(receipt, process.env.WORMHOLE_ETH_ADDRESS);
    console.log("🔢 Sequence:", sequence);
  
    const { vaaBytes } = await getSignedVAAWithRetry(
      ["https://wormhole-v2-testnet-api.certus.one"],
      "ethereum",
      emitterAddress,
      sequence
    );
  
    if (!vaaBytes) {
      throw new Error("Не удалось получить VAA через SDK. Вставьте VAA вручную в .env");
    }
  
    vaaHex = "0x" + Buffer.from(vaaBytes).toString("hex");
    console.log("🟢 Полученный VAA_HEX:", vaaHex);
  } else {
    console.log("🟢 Используется VAA_HEX из .env:", vaaHex);
  }

  // === ЭТАП 2: Solana Redeem ===
  // Подключаемся к Solana через RPC
  const solConnection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
  
  // Создаем Solana-кошелек из приватного ключа (.env хранится как JSON-массив)
  const solPrivateKey = Uint8Array.from(JSON.parse(process.env.SOL_PRIVATE_KEY));
  const solWallet = Keypair.fromSecretKey(solPrivateKey);
  console.log("👤 Solana кошелек:", solWallet.publicKey.toBase58());

  // Выполняем redeem на Solana с использованием VAA_HEX
  // Функция redeemOnSolana должна возвращать TX-сигнатуру
  const { redeemOnSolana } = require("@wormhole-foundation/sdk");
  console.log("🔄 Выполняется redeem на Solana...");
  const solTxSignature = await redeemOnSolana(solConnection, process.env.WORMHOLE_SOL_ADDRESS, vaaHex, solWallet.publicKey);
  console.log("✅ Redeem TX Signature:", solTxSignature);

  // Ждем подтверждения транзакции на Solana
  const solConfirmation = await solConnection.confirmTransaction(solTxSignature, "confirmed");
  console.log("📡 Solana TX подтверждена:", solConfirmation);

  // === ЭТАП 3: Получение адреса выпущенного токена (SPL Token) ===
  // Получаем токеновые аккаунты владельца через SPL Token
  const tokenAccounts = await solConnection.getParsedTokenAccountsByOwner(
    solWallet.publicKey,
    { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
  );

  if (tokenAccounts.value.length > 0) {
    // Выбираем последний токеновый аккаунт (предположим, это новый токен)
    const lastTokenAccount = tokenAccounts.value[tokenAccounts.value.length - 1];
    const tokenAddress = lastTokenAccount.pubkey.toBase58();
    const tokenBalance = lastTokenAccount.account.data.parsed.info.tokenAmount.uiAmount;
    console.log("🆕 Адрес нового токена:", tokenAddress);
    console.log("💰 Баланс нового токена:", tokenBalance);
  } else {
    console.log("⚠️ Токеновые аккаунты не найдены.");
  }
}

main().catch((error) => {
  console.error("❌ Ошибка:", error);
});

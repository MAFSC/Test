require("dotenv").config();
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { redeemOnSolana } = require("@wormhole-foundation/sdk");
const bs58 = require("bs58");

(async () => {
    try {
        console.log("🚀 Начинаем процесс redeem на Solana...");

        // Подключение к Solana Devnet/Testnet/Mainnet
        const solConnection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

        // Загружаем приватный ключ кошелька Solana из .env
        const solWallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.SOL_PRIVATE_KEY)));

        console.log("👤 Адрес Solana-кошелька:", solWallet.publicKey.toBase58());

        // Получаем VAA_HEX (должен быть заранее получен из Ethereum)
        const VAA_HEX = process.env.VAA_HEX;
        if (!VAA_HEX) {
            throw new Error("❌ Ошибка: VAA_HEX не найден. Убедитесь, что он задан в .env");
        }

        // Выполняем redeem на Solana
        console.log("🔄 Выполняем redeem токенов...");
        const txSignature = await redeemOnSolana(solConnection, process.env.WORMHOLE_SOL_ADDRESS, VAA_HEX, solWallet.publicKey);

        console.log("✅ Транзакция redeem успешно выполнена!");
        console.log("🔗 Ссылка на транзакцию:", `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);

        // Определяем созданный токен
        console.log("🔍 Ищем созданный токен в кошельке...");

        const tokenAccounts = await solConnection.getParsedTokenAccountsByOwner(solWallet.publicKey, { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") });

        if (tokenAccounts.value.length > 0) {
            const createdToken = tokenAccounts.value[tokenAccounts.value.length - 1].pubkey.toBase58();
            console.log("🆕 Адрес нового токена:", createdToken);
            console.log("💰 Баланс токена:", tokenAccounts.value[tokenAccounts.value.length - 1].account.data.parsed.info.tokenAmount.uiAmount);
        } else {
            console.log("⚠️ Новый токен не найден! Возможно, он еще не создан или требуется подождать подтверждения.");
        }

    } catch (error) {
        console.error("❌ Ошибка во время redeem:", error);
    }
})();


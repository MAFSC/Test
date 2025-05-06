// createToken.js
require('dotenv').config(); // если используете .env
const {
  Connection,
  Keypair,
  clusterApiUrl
} = require('@solana/web3.js');

const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo
} = require('@solana/spl-token');

async function main() {
  // 1. Подключаемся к сети (devnet, testnet, mainnet-beta)
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  // 2. Загружаем ключ из .env или используем локальный файл
  // Предположим, в .env лежит SOLANA_SECRET_KEY=[12,34,...]
  const secretKeyArray = JSON.parse(process.env.SOLANA_SECRET_KEY);
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));

  // 3. Создаём mint (это и есть «новый токен»)
  //    decimals = 9 (часто используют 9 в Solana, но можно любое число)
  console.log("Создаём новый mint...");
  const decimals = 9;
  const mintPublicKey = await createMint(
    connection,         // Подключение
    payer,              // Плательщик (и владелец)
    payer.publicKey,    // mintAuthority (кто может чеканить)
    null,               // freezeAuthority (можно null, если не нужно)
    decimals
  );
  console.log("Mint создан:", mintPublicKey.toBase58());

  // 4. Создаём (или получаем) ассоциированный токен-аккаунт для payer
  //    Это счёт, на который будут зачисляться токены
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,             // Плательщик
    mintPublicKey,     // Адрес токена
    payer.publicKey    // Владельцем счёта будет тот же payer
  );
  console.log("Токен-аккаунт:", tokenAccount.address.toBase58());

  // 5. Выпускаем (чеканим) токены
  //    Допустим, хотим выпустить 1.0 токен. При decimals=9 это 1e9 субединиц.
  const amount = 1_000_000_000; // 1.0 токен
  await mintTo(
    connection,
    payer,              // Плательщик
    mintPublicKey,      // Mint
    tokenAccount.address, // Куда зачислить
    payer.publicKey,    // mintAuthority (должен совпадать с тем, что указали выше)
    amount
  );

  console.log(`Выпущено ${amount} субединиц (1 токен) на аккаунт`, tokenAccount.address.toBase58());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

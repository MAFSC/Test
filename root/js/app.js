/* ====== КОНСТАНТЫ И НАСТРОЙКИ ====== */
const CONTRACT = '0x916ee15E71B5D7D41e99AfE7ea63F40Bf2dd10e6';   // адрес вашего Lock&Mint
const TOKEN_PRICE_USDC = 0.1;                                     // 1 токен = 0,1 USDC

/* ABI с третьим аргументом tokenAmount */
const ABI = [{
  inputs:[
    { name:'lockDays',   type:'uint256' },
    { name:'rateBps',    type:'uint16'  }, // 1 % = 100 б.п.
    { name:'tokenAmount',type:'uint256' }  // сколько токенов чеканить
  ],
  name:'createStake',
  outputs:[],
  stateMutability:'payable',
  type:'function'
}];

const PRICE_API = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';
/* =================================== */

const $  = id => document.getElementById(id);
const log = t => { $('status').textContent += t + '\n'; };

let provider, signer, contract, wallet;

/* ---------- подключение EVM ---------- */
async function connectEvm () {
  if (!window.ethereum) return log('❌ MetaMask/Phantom не найден');
  try {
    await window.ethereum.request({ method:'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer   = provider.getSigner();
    wallet   = await signer.getAddress();
    contract = new ethers.Contract(CONTRACT, ABI, signer);
    log(`✅ Подключено: ${wallet}`);
  } catch (e) { log(`⚠️  ${e.message}`); }
}

/* ---------- курс ETH-USD ---------- */
async function fetchEthUsd () {
  const r = await fetch(PRICE_API, { cache:'no-store' });
  if (!r.ok) throw new Error('Ошибка API цены');
  return (await r.json()).ethereum.usd;   // число ― например 2 000.35
}

/* ---------- превью ---------- */
async function preview () {
  try {
    const eth   = parseFloat($('ethAmount').value);
    const days  = parseInt($('lockDays').value);
    const rateP = parseFloat($('ratePercent').value);

    if (isNaN(eth)||eth<=0)  return log('Введите корректную сумму ETH');
    if (days<1||days>365)    return log('Срок 1-365 дней');
    if (rateP<5||rateP>50)   return log('Процент 5-50');

    const ethUsd       = await fetchEthUsd();
    const usdcReceive  = eth * ethUsd;
    const tokenAmount  = Math.round(usdcReceive / TOKEN_PRICE_USDC);  // токены = USD / 0,1
    const usdcReturn   = usdcReceive * (1 + rateP/100);

    log(`🔍 Курс ETH: ${ethUsd.toFixed(2)} USDC`);
    log(`Чеканится  : ${tokenAmount} токенов ↔ ${usdcReceive.toFixed(2)} USDC`);
    log(`Вернёте    : ${usdcReturn.toFixed(2)} USDC через ${days} дн. (+${rateP} %)`);
  } catch (e) { log(`⚠️  ${e.message}`); }
}

/* ---------- createStake ---------- */
async function lockEth () {
  if (!contract) return log('Сначала подключите кошелёк');

  const eth   = parseFloat($('ethAmount').value);
  const days  = parseInt($('lockDays').value);
  const rateP = parseFloat($('ratePercent').value);

  if (isNaN(eth)||eth<=0)  return log('Неверная сумма ETH');
  if (days<1||days>365)    return log('Срок 1-365');
  if (rateP<5||rateP>50)   return log('Процент 5-50');

  const rateBps = Math.round(rateP * 100);
  const ethUsd  = await fetchEthUsd();
  const usdc    = eth * ethUsd;
  const tokenAmount = Math.round(usdc / TOKEN_PRICE_USDC);

  try {
    const tx = await contract.createStake(
      days,
      rateBps,
      tokenAmount,
      { value: ethers.utils.parseEther(eth.toString()) }
    );
    log(`⏳ TX: ${tx.hash}`);
    await tx.wait();
    log('✅ Подтверждено');
  } catch (e) { log(`⚠️  ${e.reason || e.message}`); }
}

/* ---------- события UI ---------- */
$('connectEvm').onclick = connectEvm;
$('preview').onclick    = preview;
$('lockEth').onclick    = lockEth;

// oracle-service/oracle.mjs
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import Web3 from 'web3';
import fs from 'fs';
import path from 'path';
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, transfer } from '@solana/spl-token';

// ─── .env ───────────────────────────────────────────────────────
const {
  ALCHEMY_WSS_URL,
  CONTRACT_ADDRESS,
  SOLANA_SECRET_KEY,
  SPL_TOKEN_MINT = '',
  USDC_MINT,
  PORT = 3000
} = process.env;

if (!ALCHEMY_WSS_URL || !CONTRACT_ADDRESS || !SOLANA_SECRET_KEY || !USDC_MINT) {
  console.error('❌ .env must include ALCHEMY_WSS_URL, CONTRACT_ADDRESS, SOLANA_SECRET_KEY, USDC_MINT');
  process.exit(1);
}

// ─── Data storage ─────────────────────────────────────────────
const DATA_DIR  = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const BOOK_FILE = path.join(DATA_DIR, 'addressBook.json');
const MINT_FILE = path.join(DATA_DIR, 'oracleData.json');

let addressBook = fs.existsSync(BOOK_FILE) ? JSON.parse(fs.readFileSync(BOOK_FILE,'utf8')) : {};
let mintData    = fs.existsSync(MINT_FILE) ? JSON.parse(fs.readFileSync(MINT_FILE,'utf8'))    : {};

const saveBook = () => fs.writeFileSync(BOOK_FILE, JSON.stringify(addressBook,null,2),'utf8');
const saveMint = () => fs.writeFileSync(MINT_FILE,  JSON.stringify(mintData,   null,2),'utf8');

// ─── Ethereum (web3.js) ───────────────────────────────────────
const web3 = new Web3(new Web3.providers.WebsocketProvider(ALCHEMY_WSS_URL, {
  clientConfig:{ keepalive:true, keepaliveInterval:60000 }
}));

const ETH_ABI = [{
  anonymous: false,
  name: 'ETHLocked',
  type: 'event',
  inputs: [
    { indexed: true,  name: 'user',          type: 'address' },
    { indexed: false, name: 'depositAmount', type: 'uint256' },
    { indexed: false, name: 'sequence',      type: 'uint64'   }
  ]
}];

const ethContract = new web3.eth.Contract(ETH_ABI, CONTRACT_ADDRESS);

// ─── Solana setup ──────────────────────────────────────────────
const solConn  = new Connection(clusterApiUrl('devnet'), 'confirmed');
const oracleKP = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(SOLANA_SECRET_KEY)));

let tokenMint, escrowTokenAta, escrowUsdcAta;
await (async function initSol() {
  if (SPL_TOKEN_MINT.trim()) {
    tokenMint = new PublicKey(SPL_TOKEN_MINT.trim());
    console.log('✔ Using existing SPL mint:', tokenMint.toBase58());
  } else {
    tokenMint = await createMint(solConn, oracleKP, oracleKP.publicKey, null, 9);
    console.log('✔ Created new SPL mint:', tokenMint.toBase58());
  }

  escrowTokenAta = await getOrCreateAssociatedTokenAccount(
    solConn, oracleKP, tokenMint, oracleKP.publicKey
  );
  console.log('✔ Escrow token ATA:', escrowTokenAta.address.toBase58());

  escrowUsdcAta = await getOrCreateAssociatedTokenAccount(
    solConn, oracleKP, new PublicKey(USDC_MINT), oracleKP.publicKey
  );
  console.log('✔ Escrow USDC ATA:', escrowUsdcAta.address.toBase58());
})();

// ─── Listen for ETHLocked ─────────────────────────────────────
ethContract.events.ETHLocked({ fromBlock: 'latest' })
  .on('data', async ev => {
    const { user, depositAmount, sequence } = ev.returnValues;
    const evm = user.toLowerCase();
    const solAddr = addressBook[evm];
    if (!solAddr) return console.warn('⚠️ No Sol binding for', evm);

    let tokens = BigInt(depositAmount) / 10n**9n;
    if (tokens <= 0n) tokens = 1n;

    console.log(`🔔 Minting ${tokens} tokens for ${evm}`);
    const sig = await mintTo(
      solConn, oracleKP, tokenMint,
      escrowTokenAta.address, oracleKP.publicKey,
      Number(tokens)
    );
    console.log('✔ Mint sig:', sig);

    mintData[evm] = {
      user: evm,
      solAddress: solAddr,
      depositAmount,
      sequence,
      tokenAmount: tokens.toString(),
      tokenAccount: escrowTokenAta.address.toBase58(),
      mintAddress: tokenMint.toBase58(),
      txSignature: sig,
      explorerUrl: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
      timestamp: Date.now()
    };
    saveMint();
  })
  .on('error', err => console.error('WS error:', err));

// ─── Unified Express server ──────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// static frontend
app.use('/', express.static('/var/www/lock-and-mint'));

// POST /bind
app.post('/bind', (req,res) => {
  const { evm, sol } = req.body||{};
  if (!/^0x[0-9a-fA-F]{40}$/.test(evm)||!sol) {
    return res.status(400).json({ ok:false });
  }
  addressBook[evm.toLowerCase()] = sol;
  saveBook();
  console.log(`🔗 Bound ${evm} → ${sol}`);
  res.json({ ok:true });
});

// GET /lastMint
app.get('/lastMint', (req,res) => {
  const a = req.query.address?.toLowerCase();
  if (a) return res.json(mintData[a]||{});
  res.json(mintData);
});

// POST /purchase
app.post('/purchase', async (req,res) => {
  try {
    const { evm, investorSol, usdcAmount, tokenAmount } = req.body||{};
    const key = evm.toLowerCase();
    if (!addressBook[key]||!investorSol||!usdcAmount||!tokenAmount) {
      throw new Error('Invalid payload');
    }
    // USDC → borrower
    const borrowerAta = await getOrCreateAssociatedTokenAccount(
      solConn, oracleKP, new PublicKey(USDC_MINT), new PublicKey(addressBook[key])
    );
    await transfer(solConn, oracleKP,
                   escrowUsdcAta.address, borrowerAta.address,
                   oracleKP.publicKey, Number(usdcAmount));
    // Token → investor
    const investorAta = await getOrCreateAssociatedTokenAccount(
      solConn, oracleKP, tokenMint, new PublicKey(investorSol)
    );
    await transfer(solConn, oracleKP,
                   escrowTokenAta.address, investorAta.address,
                   oracleKP.publicKey, Number(tokenAmount));
    console.log(`✔ Purchased ${tokenAmount} tokens for ${investorSol}`);
    res.json({ ok:true });
  } catch(e) {
    console.error('❌ purchase error', e);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// start
app.listen(PORT, () => {
  console.log(`🚀 Oracle-service listening on port ${PORT}`);
});

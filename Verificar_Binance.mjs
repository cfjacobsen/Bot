import crypto from 'crypto';
import fetch from 'node-fetch';

// Substitua com sua chave real (NÃO da testnet!)
const API_KEY = 'O1RAqDQq88P0M8s8KOVGrcf5LhSJGU9GTg8XjH4kEvF0fhhqeYsQ53lIWFtnet1H';
const API_SECRET = 'N4yVW7xldmtn2viWySsbzhbFLsNBgdRy9V4qksOJLy97eYBRkHWnYIT2sQp3THwS';
const baseURL = 'https://api.binance.com'; // ← Binance real

async function getRealBalances() {
  const timestamp = Date.now();
  const query = `timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');

  const url = `${baseURL}/api/v3/account?${query}&signature=${signature}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': API_KEY
    }
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Erro ao verificar saldos: HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  const usdt = data.balances.find(b => b.asset === 'USDT') || { free: '0' };
  const btc = data.balances.find(b => b.asset === 'BTC') || { free: '0' };

  console.log(`💰 USDT: ${usdt.free}`);
  console.log(`₿  BTC: ${btc.free}`);
}

getRealBalances().catch(err => console.error(err.message));

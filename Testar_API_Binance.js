// Testar_API_Binance.js — CommonJS
require('dotenv').config();
const crypto = require('crypto');
const https = require('https');

const apiKey = process.env.BINANCE_API_KEY;
const apiSecret = process.env.BINANCE_API_SECRET;
console.log(apiKey, apiSecret);

function createSignature(queryString, secret) {
  return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

function getServerTime(callback) {
  https.get('https://api.binance.com/api/v3/time', res => {
    let data = '';
    res.on('data', chunk => (data += chunk));
    res.on('end', () => {
      const json = JSON.parse(data);
      callback(null, json.serverTime);
    });
  }).on('error', err => callback(err));
}

function getAccountInfo(timestamp) {
  const query = `timestamp=${timestamp}&recvWindow=60000`;
  const signature = createSignature(query, apiSecret);

  const options = {
    hostname: 'api.binance.com',
    path: `/api/v3/account?${query}&signature=${signature}`,

    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'User-Agent': 'BinanceBalanceChecker',
    },
  };

  const req = https.request(options, res => {
    let body = '';
    res.on('data', chunk => (body += chunk));
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.balances) {
          console.log('\n📊 Todos os Ativos (Free + Locked):\n');
          json.balances.forEach(asset => {
            const free = parseFloat(asset.free);
            const locked = parseFloat(asset.locked);
            const total = free + locked;
            // Mostra todos os ativos, mesmo se free ou locked forem 0
            console.log('🔹 ${asset.asset.padEnd(8)} → Free: ${free} | Locked: ${locked} | Total: ${total}');
          });
        } else {
          console.error('❌ Erro na resposta:', body);
        }
      } catch (err) {
        console.error('❌ Erro ao processar resposta:', err.message);
      }
    });
  });

  req.on('error', err => {
    console.error('❌ Erro na requisição:', err.message);
  });

  req.end();
}

console.log('💰 Testando leitura de saldo da Binance REAL...');
getServerTime((err, serverTime) => {
  if (err) {
    console.error('❌ Erro ao obter hora do servidor:', err.message);
  } else {
    getAccountInfo(serverTime);
  }
});
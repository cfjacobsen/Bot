  import crypto from 'crypto';
  import fetch from 'node-fetch';  
  import chalk from 'chalk';

const config = {
  API_KEY: 'hFDm6fUhkJoPbcxIkJL6YTnXHkVb9IB4WxSXa4GweMOgBFxE4umaMSILuSVpHGy2',
  API_SECRET: 'X8hokTifo4PTaMYMywANOVqDNBA7RXPEL8E44dL8ceQcIW7P4aZMfwKaNZMjzV9g',
  USE_TESTNET: false
};

async function getTestnetBalances() {
  try {
    const timestamp = Date.now();
    const query = `timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', config.API_SECRET)
                          .update(query)
                          .digest('hex');
    
    const url = `https://testnet.binance.vision/api/v3/account?${query}&signature=${signature}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': config.API_KEY },
      timeout: 5000
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    console.log(chalk.green('\n=== SALDOS TESTNET ==='));
    console.log('USDT:', data.balances.find(b => b.asset === 'USDT')?.free || '0');
    console.log('BTC:', data.balances.find(b => b.asset === 'BTC')?.free || '0');
    console.log('ETH:', data.balances.find(b => b.asset === 'ETH')?.free || '0');
    
    return data.balances;
  } catch (err) {
    console.error(chalk.red('Erro ao verificar saldos:'), err.message);
    process.exit(1);
  }
}

// Executa a verificação
getTestnetBalances();
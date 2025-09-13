    import chalk from 'chalk';    

    const API_KEY = 'hFDm6fUhkJoPbcxIkJL6YTnXHkVb9IB4WxSXa4GweMOgBFxE4umaMSILuSVpHGy2';
 // const API_KEY = 'sua_chave_aqui';
    const USE_TESTNET = true;

   async function getBalances() {
    try {
    const timestamp = Date.now();   mp=${timestamp}`;
    const signature = crypto.createHmac('sha256', config.API_SECRET)
                          .update(query)
                          .digest('hex');
    
    const url = `${config.USE_TESTNET ? 'https://testnet.binance.vision' : 'https://api.binance.com'}/api/v3/account?${query}&signature=${signature}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-MBX-APIKEY': config.API_KEY },
      timeout: 5000
    });

    // Debug: log da resposta bruta
    const rawData = await res.text();
    console.log('DEBUG - Resposta da API:', rawData);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}\nResposta: ${rawData}`);
    }

    const data = JSON.parse(rawData);
    estado.healthCheck.ultimaConexao = new Date().toISOString();

    // Validação dos dados
    const usdt = data.balances.find(b => b.asset === 'USDT') || { free: '0' };
    const btc = data.balances.find(b => b.asset === 'BTC') || { free: '0' };

    // Conversão segura
    const saldoUSDT = parseFloat(usdt.free) || 0;
    const saldoBTC = parseFloat(btc.free) || 0;

    // Validação de limites realistas
    if (saldoUSDT > 20000 || saldoBTC > 10) { // Limites da Testnet
      throw new Error(`Saldos irreais: USDT=${saldoUSDT} | BTC=${saldoBTC}`);
    }

    // Atualização do estado
    estado.saldoUSDT = saldoUSDT;
    estado.saldoBTC = saldoBTC;

    return { 
      USDT: saldoUSDT, 
      BTC: saldoBTC 
    };

  } catch (err) {
    // Fallback seguro em caso de erro
    const errorMsg = `Falha crítica ao obter saldos: ${err.message}`;
    console.error(chalk.red(errorMsg));
    await logger.log(errorMsg, 'ERRO');
    
    // Mantém os últimos valores válidos ou define valores padrão
    return {
      USDT: estado.saldoUSDT || 0,
      BTC: estado.saldoBTC || 0
    };
  }
}
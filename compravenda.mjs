import { BotAgressivo } from './bot_agressivo5.mjs';

async function esperarEstado(simbolo, tentativas = 20, intervalo = 500) {
  for (let i = 0; i < tentativas; i++) {
    const estado = global.estado?.[simbolo];
    if (estado) return estado;
    console.log(`⏳ Aguardando estado para ${simbolo}...`);
    await new Promise(resolve => setTimeout(resolve, intervalo));
  }
  throw new Error(`❌ Estado inválido para ${simbolo} mesmo após espera.`);
}

async function testarCompraVenda() {
  try {
     const Bot = new BotAgressivo();
     global.Bot = Bot;

    const simbolo = 'BTCUSDT';
    const precoAtual = 117000;
    const qtd = 0.0005;

    // 1. Inicializar o bot
    await Bot.iniciar();

    // 2. Esperar o estado do par estar disponível
    const estadoPar = await esperarEstado(simbolo);

    console.log(`🔁 Testando compra/venda de ${qtd} ${simbolo} @ ${precoAtual}`);

    // 3. Realizar as operações
    await global.Ordem.executarCompra(simbolo, estadoPar, precoAtual, qtd, 'FORCE TEST');
    await global.Ordem.executarVenda(simbolo, estadoPar, precoAtual * 1.005, qtd, 'FORCE TEST');

    await global.logger?.salvarStats();
    console.log("✅ Teste finalizado.");
    process.exit(0);

  } catch (error) {
    console.error("Erro no teste:", error);
    process.exit(1);
  }
}

testarCompraVenda();

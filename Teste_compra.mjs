import { BotAgressivo } from './bot_agressivo5.mjs';  // Alterado para importar a classe correta

async function testarCompraVenda() {
  try {
    const simbolo = 'BTCUSDT';
    const precoAtual = 117000;
    const qtd = 0.0005;

    // 1. Criar instância do bot
    const bot = new BotAgressivo();  // Nome da classe corrigido
    
    // 2. Inicializar o bot
    await bot.iniciar(); 

    // 3. Obter estado do par
    const estadoPar = global.estado?.[simbolo];

    if (!estadoPar) {
      console.error(`❌ Estado inválido para ${simbolo}`);
      process.exit(1);
    }

    console.log(`🔁 Testando compra/venda de ${qtd} ${simbolo} @ ${precoAtual}`);

    // 4. Usar o módulo Ordem global (que deve ser inicializado pelo bot)
    await global.Ordem.executarCompra(simbolo, estadoPar, precoAtual, qtd, 'FORCE TEST');
    await global.Ordem.executarVenda(simbolo, estadoPar, precoAtual * 1.005, 'FORCE TEST');  // Removido qtd extra

    await global.logger?.salvarStats();
    console.log("✅ Teste finalizado.");
    process.exit(0); 

  } catch (error) {
    console.error("Erro no teste:", error);
    process.exit(1);
  }
}

testarCompraVenda();

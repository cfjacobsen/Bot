import Indicadores from '../Indicadores.js';
import Ordem from '../Ordem.js';
import GerenciamentoRisco from '../GerenciamentoRisco.js';

export class PairHandler {
  constructor(symbol, estadoGlobal) {
    this.symbol = symbol;
    this.estado = { …estadoGlobal, symbol, emOperacao: false };
  }

  async atualizarIndicadores() {
    const preco = await ConexaoAPI.obterPrecoAtual(this.symbol);
    const historico = await ConexaoAPI.obterHistorico(this.symbol);
    Object.assign(this.estado, {
      precoAtual: preco,
      historicoPrecos: historico,
      rsi: Indicadores.calcRSI(historico),
      // EMA, MACD, ATR etc. atualizados conforme
    });
  }

  async executarLogicaParcial() {
    const e = this.estado;
    GerenciamentoRisco.atualizarStopMovel(e.symbol, e.precoAtual);
    await GerenciamentoRisco.verificarMetaHorariaAgressiva(e);
    await GerenciamentoRisco.verificarMicroOportunidades(e);
    await Scalping.verificarOportunidadesRapidas(e);
    await GerenciamentoRisco.verificarProtecoes(e);
    await GerenciamentoRisco.verificarRecuperacaoDrawdown(e);
    // podemos também acionar tradingAI por par, se aplicável
    Interface.mostrarStatusPar(e);
  }
}

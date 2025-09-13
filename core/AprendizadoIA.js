import brain from 'brain.js';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

export class AprendizadoIA {
  static rede = new brain.NeuralNetwork({
    activation: 'relu',
    hiddenLayers: [8, 6],
    learningRate: 0.01,
  });

  static async treinarComCSV(caminhoCSV) {
    try {
      const conteudo = await fs.readFile(caminhoCSV, 'utf8');
      const linhas = conteudo.trim().split('\n').slice(1);
      const dados = linhas.map(linha => {
        const [_, tipo, preco, qtd, taxa, rsi, emaShort, emaLong, macd, signal, histogram, atr] = linha.split(',');
        const lucro = tipo === 'venda' ? (parseFloat(preco) * parseFloat(qtd)) - parseFloat(taxa) : 0;

        return {
          input: {
            rsi: parseFloat(rsi) / 100,
            atr: parseFloat(atr) / 1000,
            macd: parseFloat(macd),
            histogram: parseFloat(histogram),
            spread: (parseFloat(emaShort) - parseFloat(emaLong)) / parseFloat(emaLong),
          },
          output: {
            sucesso: lucro > 0 ? 1 : 0
          }
        };
      }).filter(x => !Object.values(x.input).some(v => isNaN(v)));

      if (dados.length < 20) {
        console.warn(chalk.yellow('⚠️ Poucos dados válidos no CSV. IA pode ser imprecisa.'));
      }

      this.rede.train(dados, { iterations: 2000 });
      console.log(chalk.green('🧠 Rede neural treinada com sucesso!'));

    } catch (err) {
      console.error(chalk.red('Erro ao treinar IA:'), err.message);
    }
  }

  static avaliarCondicoes(estado) {
    const entrada = {
      rsi: estado.rsi / 100,
      atr: estado.atr / 1000,
      macd: estado.macd.macd,
      histogram: estado.macd.histogram,
      spread: (estado.emaShort - estado.emaLong) / estado.emaLong
    };

    const resultado = this.rede.run(entrada);
    return resultado.sucesso >= 0.65; // Pode ajustar esse limiar
  }

  static async obterCSVMaisRecente() {
    try {
      const logsDir = path.join(process.cwd(), 'LOGS');
      const arquivos = await fs.readdir(logsDir);

      const csvs = arquivos
        .filter(f => f.startsWith('trades_') && f.endsWith('.csv'))
        .map(f => ({
          nome: f,
          caminho: path.join(logsDir, f)
        }));

      const arquivosComData = await Promise.all(csvs.map(async file => {
        const stat = await fs.stat(file.caminho);
        return { ...file, mtime: stat.mtimeMs };
      }));

      arquivosComData.sort((a, b) => b.mtime - a.mtime);
      return arquivosComData[0]?.caminho || null;

    } catch (err) {
      console.error(chalk.red('Erro ao localizar CSV mais recente:'), err.message);
      return null;
    }
  }
}

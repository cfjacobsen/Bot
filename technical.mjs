// technical.mjs - Arquivo auxiliar para cálculos técnicos
class Technical {
    // Calcular RSI (Relative Strength Index)
    async rsi(precos, periodos = 14) {
        if (precos.length < periodos + 1) {
            return new Array(precos.length).fill(50);
        }
        
        const rsi = [];
        for (let i = periodos; i < precos.length; i++) {
            const ganhos = [];
            const perdas = [];
            
            for (let j = i - periodos + 1; j <= i; j++) {
                const diferenca = precos[j] - precos[j - 1];
                if (diferenca >= 0) {
                    ganhos.push(diferenca);
                    perdas.push(0);
                } else {
                    ganhos.push(0);
                    perdas.push(Math.abs(diferenca));
                }
            }
            
            const avgGanho = ganhos.reduce((sum, val) => sum + val, 0) / periodos;
            const avgPerda = perdas.reduce((sum, val) => sum + val, 0) / periodos;
            
            const rs = avgPerda === 0 ? 100 : avgGanho / avgPerda;
            const rsiValue = 100 - (100 / (1 + rs));
            
            rsi.push(rsiValue);
        }
        
        // Preencher o início do array com 50 (valor neutro)
        return new Array(periodos).fill(50).concat(rsi);
    }
    
    // Calcular EMA (Exponential Moving Average)
    async ema(precos, periodos) {
        if (precos.length < periodos) {
            return new Array(precos.length).fill(0);
        }
        
        const ema = [];
        const k = 2 / (periodos + 1);
        
        // Primeiro EMA é SMA simples
        let sma = 0;
        for (let i = 0; i < periodos; i++) {
            sma += precos[i];
        }
        sma /= periodos;
        ema.push(sma);
        
        // Calcular EMAs subsequentes
        for (let i = periodos; i < precos.length; i++) {
            const emaValue = (precos[i] * k) + (ema[ema.length - 1] * (1 - k));
            ema.push(emaValue);
        }
        
        // Preencher o início do array com 0
        return new Array(periodos - 1).fill(0).concat(ema);
    }
    
    // Calcular MACD (Moving Average Convergence Divergence)
    async macd(precos, periodoRapido = 12, periodoLento = 26, periodoSignal = 9) {
        const emaRapida = await this.ema(precos, periodoRapido);
        const emaLenta = await this.ema(precos, periodoLento);
        
        // Calcular linha MACD
        const macdLine = [];
        for (let i = 0; i < precos.length; i++) {
            if (emaRapida[i] === 0 || emaLenta[i] === 0) {
                macdLine.push(0);
            } else {
                macdLine.push(emaRapida[i] - emaLenta[i]);
            }
        }
        
        // Calcular linha de sinal (EMA da linha MACD)
        const signalLine = await this.ema(macdLine, periodoSignal);
        
        // Calcular histograma
        const histogram = [];
        for (let i = 0; i < precos.length; i++) {
            histogram.push(macdLine[i] - signalLine[i]);
        }
        
        return {
            macdLine,
            signalLine,
            histogram
        };
    }
}

module.exports = Technical;
// test_supervisor.js
import SupervisorBot from './supervisorbot.mjs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar variáveis de ambiente para teste
process.env.USE_TESTNET = 'true';
process.env.SIMULA = 'true';
process.env.OPENAI_API_KEY = 'test_key';
process.env.DEEPSEEK_API_KEY = 'test_key';

async function runTests() {
    console.log('=== INICIANDO TESTES DO SUPERVISORBOT ===\n');
    
    let testsPassed = 0;
    let totalTests = 0;
    
    // Teste 1: Detecção de Modo de Operação
    totalTests++;
    console.log('1. Testando detecção de modo de operação...');
    try {
        const supervisor = new SupervisorBot();
        const modo = supervisor.modoOperacao;
        
        if (modo === 'simulacao') {
            console.log('✓ Modo de operação detectado corretamente: SIMULA');
            testsPassed++;
        } else {
            console.log('✗ Falha na detecção do modo de operação');
        }
    } catch (error) {
        console.log('✗ Erro na detecção do modo de operação:', error.message);
    }
    
    // Teste 2: Criação de Backup
    totalTests++;
    console.log('\n2. Testando sistema de backup...');
    try {
        const supervisor = new SupervisorBot();
        
        // Criar arquivo de bot de teste
        const conteudoTeste = '// Bot de teste\nconsole.log("Teste");';
        await fs.writeFile(supervisor.arquivoBotPrincipal, conteudoTeste, 'utf8');
        
        // Criar backup
        const backupPath = await supervisor.criarBackup();
        
        if (backupPath) {
            console.log('✓ Backup criado com sucesso:', path.basename(backupPath));
            testsPassed++;
        } else {
            console.log('✗ Falha na criação do backup');
        }
    } catch (error) {
        console.log('✗ Erro na criação do backup:', error.message);
    }
    
    // Teste 3: Restauração de Backup
    totalTests++;
    console.log('\n3. Testando restauração de backup...');
    try {
        const supervisor = new SupervisorBot();
        
        // Restaurar backup
        const restaurado = await supervisor.restaurarBackup();
        
        if (restaurado) {
            console.log('✓ Backup restaurado com sucesso');
            testsPassed++;
        } else {
            console.log('✗ Falha na restauração do backup');
        }
    } catch (error) {
        console.log('✗ Erro na restauração do backup:', error.message);
    }
    
    // Teste 4: Processamento de Estado de Par
    totalTests++;
    console.log('\n4. Testando processamento de estado de par...');
    try {
        const supervisor = new SupervisorBot();
        
        const estadoPar = {
            simbolo: 'BTCUSDT',
            precoAtual: 50000,
            rsi: 65,
            emaShort: 49500,
            emaLong: 49000,
            macd: { histogram: 150, signal: 100, macd: 50 },
            volatilidade: 0.025,
            volume24h: 1000000,
            tendencia: 'ALTA'
        };
        
        // Salvar estado do par
        await supervisor.salvarEstadoPar(estadoPar);
        
        // Processar o par
        await supervisor.processarPar('BTCUSDT');
        
        // Verificar se a recomendação foi criada
        const recomendacaoPath = path.join(supervisor.diretorioRecomendacoes, 'recomendacao_BTCUSDT.json');
        try {
            await fs.access(recomendacaoPath);
            console.log('✓ Processamento de par concluído com sucesso');
            testsPassed++;
        } catch {
            console.log('✗ Arquivo de recomendação não foi criado');
        }
    } catch (error) {
        console.log('✗ Erro no processamento do par:', error.message);
    }
    
    // Teste 5: Detecção de Emergência
    totalTests++;
    console.log('\n5. Testando detecção de emergência...');
    try {
        const supervisor = new SupervisorBot();
        
        // Mock da função de análise para simular emergência
        supervisor.iaChat.analisarMercado = async () => {
            return {
                timestamp: new Date().toISOString(),
                simbolo: 'BTCUSDT',
                chatgpt: 'EMERGÊNCIA: Mercado em colapso! Vender tudo!',
                deepseek: 'EMERGÊNCIA: Queda livre detectada!',
                consenso: { acao: 'VENDER', confianca: 95, motivo: 'Emergência de mercado' },
                emergencia: true
            };
        };
        
        // Processar par com emergência
        await supervisor.processarPar('BTCUSDT');
        
        // Verificar se a emergência foi detectada
        if (supervisor.emergenciaAtiva) {
            console.log('✓ Emergência detectada corretamente');
            testsPassed++;
        } else {
            console.log('✗ Falha na detecção de emergência');
        }
    } catch (error) {
        console.log('✗ Erro na detecção de emergência:', error.message);
    }
    
    // Teste 6: Geração de Relatório
    totalTests++;
    console.log('\n6. Testando geração de relatório...');
    try {
        const supervisor = new SupervisorBot();
        
        const relatorio = await supervisor.gerarRelatorio();
        
        if (relatorio && relatorio.timestamp) {
            console.log('✓ Relatório gerado com sucesso');
            testsPassed++;
        } else {
            console.log('✗ Falha na geração do relatório');
        }
    } catch (error) {
        console.log('✗ Erro na geração do relatório:', error.message);
    }
    
    // Resultados
    console.log('\n=== RESULTADOS DOS TESTES ===');
    console.log(`Testes aprovados: ${testsPassed}/${totalTests}`);
    
    if (testsPassed === totalTests) {
        console.log('\n🎉 Todos os testes passaram! O SupervisorBot está funcionando corretamente.');
    } else {
        console.log('\n❌ Alguns testes falharam. Verifique os logs acima para detalhes.');
    }
    
    // Limpar arquivos de teste
    await cleanTestFiles();
}

async function cleanTestFiles() {
    try {
        const filesToRemove = [
            'bot_agressivo6.mjs',
            'bot_agressivo6.bkp',
            'supervisor_log.json',
            'analise_consolidada.json'
        ];
        
        const dirsToRemove = [
            'estados_pares',
            'recomendacoes_pares',
            'backups',
            'relatorios'
        ];
        
        for (const file of filesToRemove) {
            try {
                await fs.unlink(file);
            } catch (error) {
                // Ignorar se o arquivo não existir
            }
        }
        
        for (const dir of dirsToRemove) {
            try {
                await fs.rm(dir, { recursive: true, force: true });
            } catch (error) {
                // Ignorar se o diretório não existir
            }
        }
        
        console.log('\n🧹 Arquivos de teste removidos');
    } catch (error) {
        console.log('Erro ao limpar arquivos de teste:', error.message);
    }
}

// Executar os testes
runTests().catch(console.error);
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { autoUpdater } = require('electron-updater');
const { fetchEditais, fetchDetalhesContratacao, fetchOrgao, fetchItens, fetchArquivos, limparCache, estatisticasCache, setCacheDir } = require('./src/pncp-api');

let mainWindow;

function getDataPath(arquivo) { return path.join(app.getPath('userData'), arquivo); }

function lerJson(arquivo) {
  try { var p = getDataPath(arquivo); if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
  return null;
}
function salvarJson(arquivo, dados) { try { fs.writeFileSync(getDataPath(arquivo), JSON.stringify(dados, null, 2), 'utf8'); return true; } catch (e) { return false; } }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(function(d) { if (d.url.startsWith('http')) { shell.openExternal(d.url); return { action: 'deny' }; } return { action: 'allow' }; });
  if (!process.argv.includes('--dev')) mainWindow.setMenuBarVisibility(false);

  // ===== Auto-update =====
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', function(info) {
    mainWindow.webContents.executeJavaScript(
      "if (confirm('Nova versão disponível: ' + '" + info.version + "' + '\\n\\nDeseja baixar e instalar agora?')) { window.pncpAPI.baixarAtualizacao(); }"
    );
  });

  autoUpdater.on('update-not-available', function() {
    // Silencioso — não há atualização
  });

  autoUpdater.on('download-progress', function(progress) {
    mainWindow.webContents.executeJavaScript(
      "var s = document.getElementById('status'); if (s) { s.style.display='block'; s.className='status-loading'; s.innerHTML = '📥 Baixando atualização... ' + Math.round(" + progress.percent + ") + '%'; }"
    );
  });

  autoUpdater.on('update-downloaded', function() {
    mainWindow.webContents.executeJavaScript(
      "if (confirm('Atualização baixada!\\n\\nO app será reiniciado para aplicar. Continuar?')) { window.pncpAPI.instalarAtualizacao(); }"
    );
  });

  autoUpdater.on('error', function(err) {
    console.error('Erro auto-update:', err);
  });

  // Verificar atualizações 3 segundos após abrir
  setTimeout(function() {
    autoUpdater.checkForUpdates().catch(function(e) { console.error('Erro ao verificar atualização:', e); });
  }, 3000);
}

app.whenReady().then(function() {
  setCacheDir(path.join(app.getPath('userData'), 'cache'));
  createWindow();
  app.on('activate', function() { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', function() { if (process.platform !== 'darwin') app.quit(); });

// ===== IPC PNCP =====
ipcMain.handle('pncp:fetchEditais', async (e, p) => { try { return { success: true, data: await fetchEditais(p) }; } catch (err) { return { success: false, error: err.message }; } });
ipcMain.handle('pncp:fetchDetalhes', async (e, n) => { try { return { success: true, data: await fetchDetalhesContratacao(n) }; } catch (err) { return { success: false, error: err.message }; } });
ipcMain.handle('pncp:fetchOrgao', async (e, c) => { try { return { success: true, data: await fetchOrgao(c) }; } catch (err) { return { success: false, error: err.message }; } });
ipcMain.handle('pncp:fetchItens', async (e, n) => { try { return { success: true, data: await fetchItens(n) }; } catch (err) { return { success: false, error: err.message }; } });
ipcMain.handle('pncp:fetchArquivos', async (e, n) => { try { return { success: true, data: await fetchArquivos(n) }; } catch (err) { return { success: false, error: err.message }; } });
ipcMain.handle('shell:openExternal', async (e, u) => { if (u && u.startsWith('http')) { await shell.openExternal(u); return { success: true }; } return { success: false }; });
ipcMain.handle('pncp:limparCache', async () => { limparCache(); return { success: true }; });
ipcMain.handle('pncp:statsCache', async () => estatisticasCache());

// ===== IBGE =====
ipcMain.handle('ibge:buscarCidades', async (e, uf) => {
  try { var r = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados/' + uf + '/municipios', { timeout: 15000 }); var c = r.data.map(x => ({ id: x.id, nome: x.nome })); c.sort((a,b) => a.nome.localeCompare(b.nome)); return { success: true, data: c }; }
  catch (err) { return { success: false, error: err.message }; }
});

// ===== Feedback =====
ipcMain.handle('feedback:obter', async () => { var d = lerJson('feedback.json') || { positivo: [], negativo: [] }; return { success: true, data: d }; });
ipcMain.handle('feedback:marcar', async (e, desc, tipo, ncp, orgao) => {
  var d = lerJson('feedback.json') || { positivo: [], negativo: [] };
  var descN = (desc || '').toLowerCase().trim();
  ['positivo','negativo'].forEach(function(k) { d[k] = d[k].map(function(i) { return typeof i === 'string' ? { desc: i, ncp: '', orgao: '' } : i; }); });
  var outra = tipo === 'positivo' ? 'negativo' : 'positivo';
  d[outra] = d[outra].filter(i => i.desc !== descN);
  if (d[tipo].findIndex(i => i.desc === descN) === -1) d[tipo].push({ desc: descN, ncp: ncp || '', orgao: orgao || '' });
  salvarJson('feedback.json', d); return { success: true, data: d };
});
ipcMain.handle('feedback:remover', async (e, desc) => {
  var d = lerJson('feedback.json') || { positivo: [], negativo: [] };
  var descN = (desc || '').toLowerCase().trim();
  ['positivo','negativo'].forEach(function(k) { d[k] = d[k].filter(i => (typeof i === 'string' ? i : i.desc) !== descN); });
  salvarJson('feedback.json', d); return { success: true, data: d };
});

// ===== Favoritos =====
ipcMain.handle('favoritos:obter', async () => { var d = lerJson('favoritos.json') || {}; return { success: true, data: d }; });
ipcMain.handle('favoritos:marcar', async (e, ncp, status) => { var d = lerJson('favoritos.json') || {}; if (status) d[ncp] = status; else delete d[ncp]; salvarJson('favoritos.json', d); return { success: true, data: d }; });

// ===== Notas =====
ipcMain.handle('notas:obter', async (e, ncp) => { var d = lerJson('notas.json') || {}; return { success: true, data: d[ncp] || '' }; });
ipcMain.handle('notas:salvar', async (e, ncp, texto) => { var d = lerJson('notas.json') || {}; d[ncp] = texto || ''; salvarJson('notas.json', d); return { success: true }; });

// ===== Buscas Salvas =====
ipcMain.handle('buscas:obter', async () => { var d = lerJson('buscas.json') || []; return { success: true, data: d }; });
ipcMain.handle('buscas:salvar', async (e, nome, params) => { var d = lerJson('buscas.json') || []; d.push({ nome: nome, params: params, data: new Date().toISOString() }); salvarJson('buscas.json', d); return { success: true, data: d }; });
ipcMain.handle('buscas:remover', async (e, index) => { var d = lerJson('buscas.json') || []; d.splice(index, 1); salvarJson('buscas.json', d); return { success: true, data: d }; });

// ===== Calendário (.ics) =====
ipcMain.handle('calendario:criarLembrete', async (e, dados) => {
  try {
    var encerra = new Date(dados.dataEncerramento);
    var dataEvento = new Date(encerra);
    dataEvento.setDate(dataEvento.getDate() - 1);
    dataEvento.setHours(9, 0, 0, 0);
    var dataFim = new Date(dataEvento);
    dataFim.setHours(10, 0, 0, 0);

    function fmtICS(d) {
      return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0') + 'T' + String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0') + String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
    }

    var descricao = (dados.objeto || 'N/A') + '\\n\\nÓrgão: ' + (dados.orgao || 'N/A') + '\\nValor: ' + (dados.valor || 'N/A') + '\\nEncerramento: ' + (dados.dataEncerramentoFmt || 'N/A') + '\\nLocal: ' + (dados.local || 'N/A');
    if (dados.linkPNCP) descricao += '\\nLink: ' + dados.linkPNCP;

    var ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//PNCP Monitor//Decio Camargo//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:' + Date.now() + '@pncpmonitor\r\nDTSTAMP:' + fmtICS(new Date()) + '\r\nDTSTART:' + fmtICS(dataEvento) + '\r\nDTEND:' + fmtICS(dataFim) + '\r\nSUMMARY:⏰ Edital: ' + (dados.titulo || 'Edital') + '\r\nDESCRIPTION:' + descricao + '\r\nLOCATION:' + (dados.local || '') + '\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:Lembrete: Edital encerra amanhã!\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

    var nomeArquivo = 'pncp_lembrete_' + Date.now() + '.ics';
    var tempPath = path.join(app.getPath('temp'), nomeArquivo);
    fs.writeFileSync(tempPath, ics, 'utf8');
    shell.openPath(tempPath);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

// ===== Auto-update IPC =====
ipcMain.handle('update:baixar', async function() {
  try { await autoUpdater.downloadUpdate(); return { success: true }; }
  catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('update:instalar', async function() {
  autoUpdater.quitAndInstall();
  return { success: true };
});
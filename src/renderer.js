var PALAVRAS_CHAVE_LAB = {
  insumos: ['reagente','reagentes','insumo','insumos','químico','química','bioquímico','bioquímica','meio de cultura','meios de cultura','corante','corantes','solução','soluções','buffer','tampão','antissoro','antissoros','enzima','enzimas','anticorpo','anticorpos','substrato','ácido','base','sal','solvente','solventes','produto químico','composto químico'],
  equipamentos: ['centrífuga','centrifuga','microscópio','microscópios','autoclave','autoclaves','espectrofotômetro','balança analítica','balança','balanças','estufa','estufas','banho-maria','agitador','agitadores','mufla','phmetro','ph metro','pipetador','vortex','microplaca','leitor de microplaca','fluorímetro','cromatógrafo','cromatografia','espectrômetro','espectrometria','titulador','dessecador','funil','capela','coifa','equipamento laboratorial','equipamentos laboratoriais','refrigerador laboratorial','freezer laboratorial','ultrafreezer'],
  descartaveis: ['tubo de ensaio','tubos de ensaio','tubo','tubos','placa de petri','ponteira','ponteiras','pipeta','pipetas','pipeta descartável','pipetas descartáveis','lamínula','lâmina','lâminas','frasco','frascos','béquer','bico de bunsen','proveta','provetas','erlenmeyer','kitassato','balão','cuba','material descartável','materiais descartáveis','material de consumo','consumível','material laboratorial','saco','coletor','recipiente'],
  medicos: ['seringa','seringas','agulha','agulhas','material hospitalar','materiais hospitalares','equipamento médico','equipamentos médicos','luva','luvas','máscara','máscaras','material de proteção','cateter','cateteres','sonda','sondas','equipo','equipos','material cirúrgico','materiais cirúrgicos','instrumento cirúrgico','compressa','compressas','gaze','gases','algodão','atadura','produto médico','produtos médicos'],
  diagnostico: ['laboratório','laboratorial','laboratorio','análise clínica','análises clínicas','analise clinica','diagnóstico','diagnostico','patologia','exame','exames','exame laboratorial','coleta','coleta de material','coleta de amostra','amostra','amostras','biópsia','biopsia','histologia','citologia','hematologia','bioquímica clínica','imunologia','microbiologia','parasitologia','urologia','uroanálise','kit diagnóstico','teste rápido','testes rápidos','diagnóstico in vitro','point of care'],
  farmacia: ['farmácia','farmacia','medicamento','medicamentos','fármaco','farmaco','droga','drogas','antibiótico','antibiotico','analgésico','analgesico','anti-inflamatório','antisséptico','apresentação farmacêutica','composto farmacêutico','manipulação','farmácia hospitalar','medicamento controlado','medicamento essencial','insumo farmacêutico','insumos farmacêuticos','princípio ativo']
};

var editaisAtuais = [], editaisFiltrados = [], buscaCancelada = false, modalBodyBackup = '';
var feedbackAtual = { positivo: [], negativo: [] };
var favoritosAtual = {};
var paginaAtual = 1;
var ITENS_POR_PAGINA = 10;

function formatarData(d) { var a=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),di=String(d.getDate()).padStart(2,'0'); return a+m+di; }
function formatarMoeda(v) { if(!v||v===0) return 'Não informado'; return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v); }
function formatarDataExtenso(s) { if(!s) return '-'; try { var d=new Date(s); return d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); } catch(e){ return s; } }
function mostrarStatus(msg,tipo) { var s=document.getElementById('status'); s.innerHTML=msg; s.className='status-'+(tipo||'loading'); }
function obterPalavrasChaveAtivas() { var p=[]; document.querySelectorAll('.cat-check:checked').forEach(function(c){ var cat=c.dataset.cat; if(PALAVRAS_CHAVE_LAB[cat]) PALAVRAS_CHAVE_LAB[cat].forEach(function(w){p.push(w);}); }); var m=document.getElementById('palavrasChave').value.toLowerCase().split(',').map(function(x){return x.trim();}).filter(function(x){return x.length>0;}); return p.concat(m); }

function calcularRelevancia(e, pk) {
  var t = ((e.objetoCompra || '') + ' ' + (e.informacaoComplementar || '')).toLowerCase();
  var m = pk.filter(function(p) { return t.indexOf(p.toLowerCase()) !== -1; });
  var u = []; m.forEach(function(x) { if (u.indexOf(x) === -1) u.push(x); });
  var score = u.length;
  feedbackAtual.positivo.forEach(function(f) {
    var desc = typeof f === 'object' ? f.desc : f;
    if (desc && t.indexOf(desc) !== -1) score += 2;
  });
  return { score: score, matches: u };
}

function calcularUrgencia(dataEncerramento) {
  if (!dataEncerramento) return { classe: 'badge-urgencia-cinza', texto: 'Sem data' };
  var agora = new Date(), encerra = new Date(dataEncerramento), diffDias = Math.ceil((encerra - agora) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return { classe: 'badge-urgencia-cinza', texto: 'Encerrado' };
  if (diffDias <= 3) return { classe: 'badge-urgencia-vermelho', texto: '🔴 ' + diffDias + 'd restantes' };
  if (diffDias <= 7) return { classe: 'badge-urgencia-amarelo', texto: '🟡 ' + diffDias + 'd restantes' };
  return { classe: 'badge-urgencia-verde', texto: '🟢 ' + diffDias + 'd restantes' };
}

async function carregarCidades(uf) {
  var g = document.getElementById('cidadeGroup'), s = document.getElementById('cidade');
  if (!uf) { g.style.display = 'none'; s.innerHTML = '<option value="">Todas</option>'; return; }
  g.style.display = 'flex'; s.innerHTML = '<option value="">Carregando...</option>'; s.disabled = true;
  try { var r = await window.pncpAPI.buscarCidades(uf); s.innerHTML = '<option value="">Todas as cidades</option>'; if (r.success && r.data) r.data.forEach(function(c){ s.innerHTML += '<option value="'+c.id+'">'+c.nome+'</option>'; }); }
  catch(e) { s.innerHTML = '<option value="">Erro</option>'; }
  s.disabled = false;
}

async function buscarEditais() {
  if (buscaCancelada === false && document.getElementById('btnBuscar').dataset.busca === 'true') { buscaCancelada = true; mostrarStatus('Cancelando...'); return; }
  var dataInicial = document.getElementById('dataInicial').value;
  var dataFinal = document.getElementById('dataFinal').value;
  var uf = document.getElementById('uf').value, cidade = document.getElementById('cidade').value;
  var modalidade = document.getElementById('modalidade').value, cnpj = document.getElementById('cnpj').value.replace(/\D/g,'');
  var modoFiltro = document.getElementById('modoFiltro').value;
  var numeroEdital = document.getElementById('numeroEdital').value.trim();
  if (!dataInicial || !dataFinal) { mostrarStatus('⚠ Selecione as datas','error'); return; }
  var pk = obterPalavrasChaveAtivas();
  var btn = document.getElementById('btnBuscar');
  buscaCancelada = false; btn.dataset.busca = 'true'; btn.textContent = '⏹ Cancelar'; btn.classList.add('btn-cancel');
  mostrarStatus('Buscando editais no PNCP...');
  var params = { dataInicial: formatarData(new Date(dataInicial+'T00:00:00')), dataFinal: formatarData(new Date(dataFinal+'T00:00:00')) };
  if (uf) params.uf = uf; if (cidade) params.codigoMunicipioIbge = cidade; if (modalidade) params.codigoModalidadeContratacao = parseInt(modalidade); if (cnpj) params.cnpj = cnpj;
  try {
    var res1 = await window.pncpAPI.fetchEditais(Object.assign({}, params, { pagina: 1, tamanhoPagina: 50 }));
    if (!res1.success) throw new Error(res1.error);
    var totalPag = Math.min(res1.data.totalPaginas || 1, 20);
    var totalReg = res1.data.totalRegistros || 0;
    var todos = res1.data.editais.slice();
    var tagCache = res1.data.fromCache ? '📋 (cache) ' : '';
    mostrarStatus(tagCache + 'Buscando... ' + todos.length + ' de ' + totalReg + ' (página 1/' + totalPag + ')');
    if (totalPag > 1) {
      for (var inicio = 2; inicio <= totalPag; inicio += 3) {
        if (buscaCancelada) break;
        var lote = [];
        for (var p = inicio; p < inicio + 3 && p <= totalPag; p++) lote.push(p);
        var promessas = lote.map(function(pg) { return window.pncpAPI.fetchEditais(Object.assign({}, params, { pagina: pg, tamanhoPagina: 50 })); });
        var resultados = await Promise.all(promessas);
        var todasDoLoteCache = true;
        resultados.forEach(function(r) { if (r.success && r.data.editais.length > 0) { todos = todos.concat(r.data.editais); if (!r.data.fromCache) todasDoLoteCache = false; } });
        var fimLote = Math.min(inicio + 2, totalPag);
        var t = todasDoLoteCache ? '📋 (cache) ' : '';
        mostrarStatus(t + 'Buscando... ' + todos.length + ' de ' + totalReg + ' (páginas ' + inicio + '-' + fimLote + '/' + totalPag + ')');
      }
    }
    if (!buscaCancelada || todos.length > 0) {
      var vistos = {}; var unicos = todos.filter(function(e){ var id=e.numeroControlePNCP; if(!id||vistos[id])return false; vistos[id]=true; return true; });
      unicos.forEach(function(e){ e.relevancia = calcularRelevancia(e, pk); });
      if (numeroEdital) unicos = unicos.filter(function(e){ var num = (e.numeroCompra || '') + '/' + (e.anoCompra || ''); return num.indexOf(numeroEdital) !== -1; });
      var filtrados; var resumo = '';
      if (modoFiltro === 'apenas' && pk.length > 0) { filtrados = unicos.filter(function(e){ return e.relevancia.score > 0; }); filtrados.sort(function(a,b){ return b.relevancia.score - a.relevancia.score; }); resumo = filtrados.length + ' relevantes de ' + unicos.length + ' total'; }
      else { filtrados = unicos; filtrados.sort(function(a,b){ return b.relevancia.score - a.relevancia.score; }); var rel = filtrados.filter(function(e){ return e.relevancia.score > 0; }).length; resumo = rel > 0 ? rel + ' relevantes destacados' : ''; }
      editaisAtuais = filtrados; paginaAtual = 1;
      aplicarFiltrosTela();
      document.getElementById('resumoFiltro').textContent = resumo;
      document.getElementById('btnExportar').style.display = filtrados.length > 0 ? 'inline-block' : 'none';
      var totalValor = filtrados.reduce(function(s,e){ return s + (e.valorTotalEstimado||0); }, 0);
      var relF = filtrados.filter(function(e){ return e.relevancia.score > 0; }).length;
      var favs = filtrados.filter(function(e){ return favoritosAtual[e.numeroControlePNCP]; }).length;
      mostrarStats(filtrados.length, relF, favs, totalValor);
      if (filtrados.length > 0) { var msg = buscaCancelada ? ' (cancelada)' : ''; mostrarStatus('✅ ' + filtrados.length + ' editais (' + relF + ' relevantes)' + msg + ' — 📋 cache ativo','success'); }
      else if (!buscaCancelada) { mostrarStatus('Nenhum edital encontrado','error'); }
    }
  } catch(err) { mostrarStatus('❌ ' + err.message, 'error'); }
  finally { buscaCancelada = false; btn.dataset.busca = 'false'; btn.textContent = '🔍 Buscar'; btn.classList.remove('btn-cancel'); }
}

function mostrarStats(total, relevantes, favoritos, valor) {
  var p = document.getElementById('statsPanel'); p.style.display = 'flex';
  p.innerHTML = '<div class="stat-card"><div class="stat-numero">'+total+'</div><div class="stat-label">Editais</div></div><div class="stat-card"><div class="stat-numero">'+relevantes+'</div><div class="stat-label">Relevantes</div></div><div class="stat-card"><div class="stat-numero">'+favoritos+'</div><div class="stat-label">Favoritos</div></div><div class="stat-card"><div class="stat-numero" style="font-size:16px;">'+formatarMoeda(valor)+'</div><div class="stat-label">Valor Total</div></div>';
}

function aplicarFiltrosTela() {
  var texto = document.getElementById('buscaTexto').value.toLowerCase().trim();
  var ordem = document.getElementById('ordenacao').value;
  var lista = editaisAtuais.slice();
  if (texto) lista = lista.filter(function(e){ return ((e.objetoCompra||'')+' '+(e.orgaoNome||'')+' '+(e.municipioNome||'')).toLowerCase().indexOf(texto) !== -1; });
  if (ordem === 'encerramento') lista.sort(function(a,b){ return new Date(a.dataEncerramentoProposta||'9999') - new Date(b.dataEncerramentoProposta||'9999'); });
  else if (ordem === 'valor') lista.sort(function(a,b){ return (b.valorTotalEstimado||0) - (a.valorTotalEstimado||0); });
  else lista.sort(function(a,b){ return (b.relevancia&&b.relevancia.score||0) - (a.relevancia&&a.relevancia.score||0); });
  editaisFiltrados = lista;
  renderizarPagina();
}

function renderizarPagina() {
  var inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
  var editaisDaPagina = editaisFiltrados.slice(inicio, inicio + ITENS_POR_PAGINA);
  renderizarEditais(editaisDaPagina);
  renderizarPaginacao();
}

function renderizarEditais(editais) {
  var container = document.getElementById('listaEditais'); var titulo = document.getElementById('totalResultados');
  if (editaisFiltrados.length === 0) { titulo.textContent = ''; container.innerHTML = '<div class="empty-state"><h3>Nenhum edital</h3><p>Ajuste os filtros.</p></div>'; document.getElementById('paginacao').innerHTML = ''; return; }
  var ini = (paginaAtual - 1) * ITENS_POR_PAGINA + 1, fim = Math.min(paginaAtual * ITENS_POR_PAGINA, editaisFiltrados.length);
  titulo.textContent = editaisFiltrados.length + ' editais — mostrando ' + ini + '-' + fim;
  container.innerHTML = editais.map(function(e) {
    var idx = editaisAtuais.indexOf(e);
    var objeto = e.objetoCompra || 'Não informado';
    var score = (e.relevancia && e.relevancia.score) || 0;
    var matches = (e.relevancia && e.relevancia.matches) || [];
    var classe = ''; var badges = ['<span class="badge badge-modalidade">'+(e.modalidadeNome||'N/A')+'</span>'];
    if (e.uf) badges.push('<span class="badge badge-uf">'+e.uf+'</span>');
    if (e.valorTotalEstimado > 0) badges.push('<span class="badge badge-valor">'+formatarMoeda(e.valorTotalEstimado)+'</span>');
    if (score >= 3) { classe = 'muito-relevante'; badges.push('<span class="badge badge-match">🎯 '+score+'</span>'); }
    else if (score >= 1) { classe = 'relevante'; badges.push('<span class="badge badge-match">✅ '+score+'</span>'); }
    var urg = calcularUrgencia(e.dataEncerramentoProposta);
    badges.push('<span class="badge '+urg.classe+'">'+urg.texto+'</span>');
    var fav = favoritosAtual[e.numeroControlePNCP];
    if (fav === 'interessante') { classe += ' fav-interessante'; badges.push('<span class="badge badge-fav">⭐ Interessante</span>'); }
    else if (fav === 'participando') { classe += ' fav-participando'; badges.push('<span class="badge badge-fav">📋 Participando</span>'); }
    else if (fav === 'descartado') { classe += ' fav-descartado'; badges.push('<span class="badge badge-fav">❌ Descartado</span>'); }
    var itensPos = feedbackAtual.positivo.filter(function(f){ var n = typeof f === 'object' ? f.ncp : ''; return n === e.numeroControlePNCP; }).length;
    if (itensPos > 0) badges.push('<span class="badge badge-feedback-itens">⭐ '+itensPos+' produto(s) seu(s)</span>');
    var objD = objeto;
    matches.forEach(function(m){ var p = objD.split(m); if (p.length > 1) objD = p.join('<mark style="background:#fff9c4;padding:1px 3px;border-radius:2px;">'+m+'</mark>'); });
    var mHTML = '';
    if (matches.length > 0) { var tags = matches.slice(0,5).map(function(m){ return '<span style="background:#e3f2fd;padding:1px 6px;border-radius:8px;margin-right:4px;">'+m+'</span>'; }).join(''); mHTML = '<div class="card-matches" style="margin-top:6px;font-size:12px;color:#666;">Palavras: '+tags+'</div>'; }
    return '<div class="card-edital '+classe+'" onclick="abrirDetalhes('+idx+')"><div class="card-header"><div class="card-titulo">'+(e.orgaoNome||'')+' — '+(e.numeroCompra||'')+'/'+(e.anoCompra||'')+'</div><div>'+badges.join('')+'</div></div><div class="card-info"><span>📅 '+formatarDataExtenso(e.dataAberturaProposta)+'</span><span>⏰ '+formatarDataExtenso(e.dataEncerramentoProposta)+'</span><span>🏛️ '+(e.nomeUnidadeOrgao||'')+'</span></div><div class="card-objeto">'+objD+'</div>'+mHTML+'</div>';
  }).join('');
}

function renderizarPaginacao() {
  var div = document.getElementById('paginacao');
  var totalPaginas = Math.ceil(editaisFiltrados.length / ITENS_POR_PAGINA);
  if (totalPaginas <= 1) { div.innerHTML = ''; return; }
  var html = '<button onclick="mudarPagina('+(paginaAtual-1)+')" '+(paginaAtual===1?'disabled':'')+'>‹</button>';
  var inicio = Math.max(1, paginaAtual - 2), fim = Math.min(totalPaginas, paginaAtual + 2);
  if (inicio > 1) { html += '<button onclick="mudarPagina(1)">1</button>'; if (inicio > 2) html += '<span class="pag-info">...</span>'; }
  for (var i = inicio; i <= fim; i++) html += '<button class="'+(i===paginaAtual?'ativo':'')+'" onclick="mudarPagina('+i+')">'+i+'</button>';
  if (fim < totalPaginas) { if (fim < totalPaginas-1) html += '<span class="pag-info">...</span>'; html += '<button onclick="mudarPagina('+totalPaginas+')">'+totalPaginas+'</button>'; }
  html += '<button onclick="mudarPagina('+(paginaAtual+1)+')" '+(paginaAtual===totalPaginas?'disabled':'')+'>›</button>';
  html += '<span class="pag-info">Página '+paginaAtual+' de '+totalPaginas+'</span>';
  div.innerHTML = html;
}

function mudarPagina(p) {
  var total = Math.ceil(editaisFiltrados.length / ITENS_POR_PAGINA);
  if (p < 1 || p > total) return;
  paginaAtual = p; renderizarPagina(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function abrirDetalhes(index) {
  var e = editaisAtuais[index]; if (!e) return;
  var modal = document.getElementById('modal'), body = document.getElementById('modalBody');
  var score = (e.relevancia && e.relevancia.score) || 0, matches = (e.relevancia && e.relevancia.matches) || [];
  var relHTML = '';
  if (score > 0) { var tags = matches.map(function(m){ return '<span style="background:#c8e6c9;padding:2px 8px;border-radius:8px;margin-right:4px;">'+m+'</span>'; }).join(''); relHTML = '<div class="modal-detalhe" style="background:#e8f5e9;padding:12px;border-radius:6px;"><label>🎯 Relevância</label><p><strong>'+score+' palavra(s)-chave:</strong> '+tags+'</p></div>'; }
  var ncp = e.numeroControlePNCP || '', ncpN = ncp.replace(/\//g,'-'), partes = ncpN.split('-'), linkPNCP = '';
  if (partes.length >= 4) linkPNCP = 'https://pncp.gov.br/app/editais/'+partes[0]+'/'+partes[3]+'/'+partes[2];
  var botoes = '<div style="margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;">';
  if (linkPNCP) botoes += '<button onclick="window.pncpAPI.openExternal(\''+linkPNCP+'\')" style="background:#1565c0;color:white;padding:10px 24px;border-radius:6px;border:none;font-weight:600;font-size:14px;cursor:pointer;">🔗 Ver no PNCP</button>';
  botoes += '<button onclick="carregarItens(\''+e.numeroControlePNCP+'\')" style="background:#2e7d32;color:white;padding:10px 24px;border-radius:6px;border:none;font-weight:600;font-size:14px;cursor:pointer;">📋 Ver Produtos</button>';
  botoes += '<button onclick="carregarArquivos(\''+e.numeroControlePNCP+'\')" style="background:#e65100;color:white;padding:10px 24px;border-radius:6px;border:none;font-weight:600;font-size:14px;cursor:pointer;">📎 Ver Arquivos</button>';
  var calId = 'cal_' + index;
  window._calData = window._calData || {};
  window._calData[calId] = { titulo: (e.orgaoNome||'')+' '+(e.numeroCompra||'')+'/'+(e.anoCompra||''), objeto: e.objetoCompra || '', orgao: e.orgaoNome || '', valor: formatarMoeda(e.valorTotalEstimado), dataEncerramento: e.dataEncerramentoProposta, dataEncerramentoFmt: formatarDataExtenso(e.dataEncerramentoProposta), local: (e.municipioNome||'')+' - '+(e.uf||''), linkPNCP: linkPNCP };
  botoes += '<button onclick="criarLembreteCalendario(\''+calId+'\')" style="background:#7b1fa2;color:white;padding:10px 24px;border-radius:6px;border:none;font-weight:600;font-size:14px;cursor:pointer;">📅 Lembrete Outlook</button>';
  botoes += '</div>';
  var fav = favoritosAtual[ncp] || '';
  var favHTML = '<div class="fav-botoes"><button class="fav-btn'+(fav==='interessante'?' ativo-interessante':'')+'" onclick="marcarFavorito(\''+ncp+'\',\'interessante\','+index+')">⭐ Interessante</button><button class="fav-btn'+(fav==='participando'?' ativo-participando':'')+'" onclick="marcarFavorito(\''+ncp+'\',\'participando\','+index+')">📋 Participando</button><button class="fav-btn'+(fav==='descartado'?' ativo-descartado':'')+'" onclick="marcarFavorito(\''+ncp+'\',\'descartado\','+index+')">❌ Descartado</button></div>';
  var nota = '';
  try { var nr = await window.pncpAPI.obterNota(ncp); if (nr.success) nota = nr.data || ''; } catch(ex) {}
  var notaHTML = '<div class="nota-container"><label>📝 Notas pessoais</label><textarea id="notaPessoal" placeholder="Anote observações sobre este edital..." onblur="salvarNota(\''+ncp+'\')">'+nota+'</textarea></div>';
  var linkOrigem = e.linkSistemaOrigem ? '<div class="modal-detalhe"><label>Sistema de Origem</label><p><button onclick="window.pncpAPI.openExternal(\''+e.linkSistemaOrigem+'\')" style="background:none;border:none;color:#1565c0;cursor:pointer;text-decoration:underline;">Abrir →</button></p></div>' : '';
  body.innerHTML = '<h2 style="margin-bottom:12px;color:#1a3a5c;">'+(e.orgaoNome||'')+' — '+(e.numeroCompra||'')+'/'+(e.anoCompra||'')+'</h2>'+botoes+favHTML+relHTML+notaHTML+
    '<div class="modal-detalhe"><label>Modalidade</label><p>'+(e.modalidadeNome||'N/A')+'</p></div><div class="modal-detalhe"><label>Tipo</label><p>'+(e.tipoInstrumentoConvocatorioNome||'N/A')+'</p></div><div class="modal-detalhe"><label>Objeto</label><p>'+(e.objetoCompra||'Não informado')+'</p></div><div class="modal-detalhe"><label>Info Complementar</label><p>'+(e.informacaoComplementar||'Não informado')+'</p></div><div class="modal-detalhe"><label>Valor</label><p>'+formatarMoeda(e.valorTotalEstimado)+'</p></div><div class="modal-detalhe"><label>Período</label><p>De '+formatarDataExtenso(e.dataAberturaProposta)+' até '+formatarDataExtenso(e.dataEncerramentoProposta)+'</p></div><div class="modal-detalhe"><label>Situação</label><p>'+(e.situacaoCompraNome||'N/A')+'</p></div><div class="modal-detalhe"><label>Órgão</label><p>'+(e.orgaoNome||'N/A')+' - '+(e.nomeUnidadeOrgao||'N/A')+'</p></div><div class="modal-detalhe"><label>CNPJ</label><p>'+(e.cnpjOrgao||'N/A')+'</p></div><div class="modal-detalhe"><label>Local</label><p>'+(e.municipioNome||'N/A')+' - '+(e.uf||'N/A')+'</p></div><div class="modal-detalhe"><label>Processo</label><p>'+(e.processo||'N/A')+' | '+(e.numeroCompra||'N/A')+'/'+(e.anoCompra||'')+'</p></div><div class="modal-detalhe"><label>Amparo</label><p>'+(e.amparoLegal?(e.amparoLegal.nome||'N/A'):'N/A')+'</p></div><div class="modal-detalhe"><label>Disputa</label><p>'+(e.modoDisputaNome||'N/A')+'</p></div><div class="modal-detalhe"><label>SRP</label><p>'+(e.srp?'Sim':'Não')+'</p></div>'+linkOrigem;
  modal.className = '';
}

async function criarLembreteCalendario(calId) {
  var dados = window._calData ? window._calData[calId] : null;
  if (!dados) { mostrarStatus('❌ Dados não encontrados', 'error'); return; }
  try {
    var res = await window.pncpAPI.criarLembrete(dados);
    if (res.success) mostrarStatus('📅 Lembrete criado! O Outlook vai abrir.', 'success');
    else mostrarStatus('❌ Erro: ' + (res.error || ''), 'error');
  } catch(e) { mostrarStatus('❌ Erro: ' + e.message, 'error'); }
}

async function marcarFavorito(ncp, status, index) {
  var atual = favoritosAtual[ncp];
  if (atual === status) { await window.pncpAPI.marcarFavorito(ncp, null); delete favoritosAtual[ncp]; }
  else { await window.pncpAPI.marcarFavorito(ncp, status); favoritosAtual[ncp] = status; }
  abrirDetalhes(index); renderizarPagina();
}

async function salvarNota(ncp) { var t = document.getElementById('notaPessoal'); if (t) await window.pncpAPI.salvarNota(ncp, t.value); }

async function carregarItens(ncp) {
  var body = document.getElementById('modalBody'); if (!body) return;
  modalBodyBackup = body.innerHTML;
  body.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">⏳ Carregando...</p>';
  try {
    var res = await window.pncpAPI.fetchItens(ncp);
    if (!res.success) { body.innerHTML = btnVoltar()+'<p style="color:#c62828;padding:20px;text-align:center;">❌ '+res.error+'</p>'; return; }
    var itens = res.data; if (!itens || itens.length === 0) { body.innerHTML = btnVoltar()+'<p style="color:#666;padding:20px;text-align:center;">Nenhum item.</p>'; return; }
    var tag = res.fromCache ? ' 📋 (cache)' : ''; var total = 0;
    var edital = editaisAtuais.find(function(e){ return e.numeroControlePNCP === ncp; });
    var orgaoNome = edital ? (edital.orgaoNome || '') : '';
    var linhas = itens.map(function(item) {
      total += item.valorTotal || 0;
      var desc = (item.descricao || '').toLowerCase().trim();
      var isPos = feedbackAtual.positivo.some(function(f){ return (typeof f==='object'?f.desc:f) === desc; });
      var cl = isPos ? 'item-positivo' : '';
      var bU = isPos ? ' ativo' : '';
      var descEsc = desc.replace(/'/g,"\'");
      return '<tr class="'+cl+'"><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:600;">'+item.numero+'</td><td style="padding:10px 8px;border-bottom:1px solid #eee;">'+item.descricao+'</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;">'+item.quantidade+' '+item.unidadeMedida+'</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">'+formatarMoeda(item.valorUnitario)+'</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">'+formatarMoeda(item.valorTotal)+'</td><td style="padding:10px 8px;border-bottom:1px solid #eee;text-align:center;"><button class="btn-feedback btn-thumb-up'+bU+'" onclick="marcarItem(\''+descEsc+'\',\'positivo\',\''+ncp.replace(/'/g,"\'")+'\',\''+orgaoNome.replace(/'/g,"\'")+'\')" title="Marcar como produto nosso">👍</button></td></tr>';
    }).join('');
    body.innerHTML = btnVoltar()+'<h2 style="margin-bottom:16px;color:#1a3a5c;">📋 Itens ('+itens.length+')'+tag+'</h2><div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f5f5f5;"><th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:center;">Nº</th><th style="padding:10px 8px;border-bottom:2px solid #ddd;">Descrição</th><th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:center;">Qtd</th><th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:right;">Unit.</th><th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:right;">Total</th><th style="padding:10px 8px;border-bottom:2px solid #ddd;text-align:center;">Feedback</th></tr></thead><tbody>'+linhas+'</tbody><tfoot><tr style="background:#e8f5e9;font-weight:700;"><td colspan="4" style="padding:12px 8px;text-align:right;">TOTAL:</td><td style="padding:12px 8px;text-align:right;font-size:14px;">'+formatarMoeda(total)+'</td><td></td></tr></tfoot></table></div>';
  } catch(ex) { body.innerHTML = btnVoltar()+'<p style="color:#c62828;padding:20px;text-align:center;">❌ '+ex.message+'</p>'; }
}

async function carregarArquivos(ncp) {
  var body = document.getElementById('modalBody'); if (!body) return;
  modalBodyBackup = body.innerHTML;
  body.innerHTML = '<p style="text-align:center;padding:40px;color:#666;">⏳ Carregando arquivos...</p>';
  try {
    var res = await window.pncpAPI.fetchArquivos(ncp);
    if (!res.success) { body.innerHTML = btnVoltar()+'<p style="color:#c62828;padding:20px;text-align:center;">❌ '+res.error+'</p>'; return; }
    var docs = res.data;
    if (!docs || docs.length === 0) { body.innerHTML = btnVoltar()+'<p style="color:#666;padding:20px;text-align:center;">Nenhum arquivo disponível.</p>'; return; }
    var tag = res.fromCache ? ' 📋 (cache)' : '';
    var cards = docs.map(function(doc) {
      var dataFmt = doc.dataPublicacao ? formatarDataExtenso(doc.dataPublicacao) : 'Não informado';
      var tipoCor = { 'Edital':'#1565c0', 'Aviso de Contratação Direta':'#1565c0', 'Termo de Referência':'#2e7d32', 'Minuta de Contrato':'#7b1fa2', 'Projeto Básico':'#e65100', 'Estudo Técnico Preliminar':'#e65100', 'Anteprojeto':'#e65100', 'Projeto Executivo':'#e65100', 'Outros Anexos':'#757575' };
      var cor = tipoCor[doc.tipo] || '#757575';
      var btn = doc.url ? '<button onclick="window.pncpAPI.openExternal(\''+doc.url.replace(/'/g,"\'")+'\')" style="background:'+cor+';color:white;padding:6px 16px;border-radius:6px;border:none;font-weight:600;font-size:13px;cursor:pointer;">📥 Baixar / Abrir</button>' : '<span style="color:#999;">Sem link</span>';
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;"><div style="flex:1;"><div style="font-size:14px;font-weight:600;color:#333;margin-bottom:2px;">'+doc.titulo+'</div><div style="font-size:12px;color:#777;"><span style="background:'+cor+'22;color:'+cor+';padding:2px 8px;border-radius:8px;font-weight:600;margin-right:6px;">'+doc.tipo+'</span><span>📅 '+dataFmt+'</span></div></div><div style="margin-left:12px;">'+btn+'</div></div>';
    }).join('');
    body.innerHTML = btnVoltar()+'<h2 style="margin-bottom:16px;color:#1a3a5c;">📎 Arquivos ('+docs.length+')'+tag+'</h2>'+cards;
  } catch(ex) { body.innerHTML = btnVoltar()+'<p style="color:#c62828;padding:20px;text-align:center;">❌ '+ex.message+'</p>'; }
}

function btnVoltar() { return '<button onclick="voltarDetalhes()" style="background:#1565c0;color:white;padding:8px 18px;border-radius:6px;border:none;font-weight:600;cursor:pointer;margin-bottom:16px;">← Voltar</button>'; }

async function marcarItem(desc, tipo, ncp, orgao) {
  var jaMarcado = feedbackAtual.positivo.some(function(f){ return (typeof f==='object'?f.desc:f) === desc; });
  if (jaMarcado) { var res = await window.pncpAPI.removerFeedback(desc); if (res.success) feedbackAtual = res.data; }
  else { var res = await window.pncpAPI.marcarFeedback(desc, 'positivo', ncp, orgao); if (res.success) feedbackAtual = res.data; }
  var linhas = document.querySelectorAll('#modalBody tbody tr');
  linhas.forEach(function(linha) {
    var celula = linha.querySelectorAll('td')[1];
    if (celula && celula.textContent.toLowerCase().trim() === desc) {
      var bU = linha.querySelector('.btn-thumb-up');
      var estaPos = feedbackAtual.positivo.some(function(f){ return (typeof f==='object'?f.desc:f) === desc; });
      linha.classList.remove('item-positivo'); if (bU) bU.classList.remove('ativo');
      if (estaPos) { linha.classList.add('item-positivo'); if (bU) bU.classList.add('ativo'); }
    }
  });
  renderizarPagina();
}

function voltarDetalhes() { var b = document.getElementById('modalBody'); if (b && modalBodyBackup) b.innerHTML = modalBodyBackup; }

async function abrirPainelFeedback() {
  var modal = document.getElementById('modalFeedback'), body = document.getElementById('modalFeedbackBody');
  body.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">Carregando...</p>'; modal.className = '';
  try {
    var res = await window.pncpAPI.obterFeedback(); if (!res.success) return;
    feedbackAtual = res.data;
    var pos = res.data.positivo || [];
    var posHTML = pos.length > 0 ? pos.map(function(f){ var d = typeof f === 'object' ? f.desc : f; return '<div class="feedback-item"><span class="feedback-item-desc">⭐ '+d+'</span><button class="feedback-item-remover" onclick="removerFeedbackItem(\''+d.replace(/'/g,"\'")+'\')">✕</button></div>'; }).join('') : '<div class="feedback-vazio">Nenhum produto marcado ainda. Abra um edital, clique em "Ver Produtos" e marque com 👍.</div>';
    body.innerHTML = '<div class="feedback-secao"><div class="feedback-secao-titulo">⭐ Produtos da Décio Camargo ('+pos.length+')</div><div class="feedback-lista">'+posHTML+'</div></div>';
  } catch(e) { body.innerHTML = '<p style="color:#c62828;">Erro</p>'; }
}

async function removerFeedbackItem(desc) { var res = await window.pncpAPI.removerFeedback(desc); if (res.success) { feedbackAtual = res.data; abrirPainelFeedback(); renderizarPagina(); } }

async function carregarBuscasSalvas() {
  try {
    var res = await window.pncpAPI.obterBuscas(); if (!res.success) return;
    var div = document.getElementById('buscasSalvas');
    if (!res.data || res.data.length === 0) { div.innerHTML = ''; return; }
    div.innerHTML = res.data.map(function(b, i) { return '<div class="busca-tag" onclick="carregarBusca('+i+')">🔄 '+b.nome+'<button class="busca-tag-remover" onclick="event.stopPropagation();removerBusca('+i+')">✕</button></div>'; }).join('');
  } catch(e) {}
}

async function salvarBuscaAtual() {
  var nome = prompt('Nome da busca:'); if (!nome) return;
  var params = { dataInicial: document.getElementById('dataInicial').value, dataFinal: document.getElementById('dataFinal').value, uf: document.getElementById('uf').value, cidade: document.getElementById('cidade').value, modalidade: document.getElementById('modalidade').value, numeroEdital: document.getElementById('numeroEdital').value, cnpj: document.getElementById('cnpj').value, palavrasChave: document.getElementById('palavrasChave').value, modoFiltro: document.getElementById('modoFiltro').value, categorias: Array.from(document.querySelectorAll('.cat-check:checked')).map(function(c){ return c.dataset.cat; }) };
  await window.pncpAPI.salvarBusca(nome, params); carregarBuscasSalvas();
}

function carregarBusca(index) {
  window.pncpAPI.obterBuscas().then(function(res) {
    if (!res.success) return; var b = res.data[index]; if (!b) return; var p = b.params;
    document.getElementById('dataInicial').value = p.dataInicial || '';
    document.getElementById('dataFinal').value = p.dataFinal || '';
    document.getElementById('uf').value = p.uf || '';
    if (p.uf) { carregarCidades(p.uf).then(function(){ document.getElementById('cidade').value = p.cidade || ''; }); }
    document.getElementById('modalidade').value = p.modalidade || '';
    document.getElementById('numeroEdital').value = p.numeroEdital || '';
    document.getElementById('cnpj').value = p.cnpj || '';
    document.getElementById('palavrasChave').value = p.palavrasChave || '';
    document.getElementById('modoFiltro').value = p.modoFiltro || 'destacar';
    document.querySelectorAll('.cat-check').forEach(function(c){ c.checked = p.categorias ? p.categorias.indexOf(c.dataset.cat) !== -1 : true; });
    mostrarStatus('Busca "'+b.nome+'" carregada. Clique em Buscar.','success');
  });
}

async function removerBusca(index) { await window.pncpAPI.removerBusca(index); carregarBuscasSalvas(); }

function exportarExcel() {
  if (editaisAtuais.length === 0) return;
  var headers = ['Órgão','Unidade','Modalidade','UF','Município','Objeto','Valor','Abertura','Encerramento','Situação','CNPJ','Processo','Compra','Relevância','Palavras','Favorito','Link'];
  var html = '<table border="1" style="font-family:Arial;font-size:11px;"><tr style="background:#1a3a5c;color:white;font-weight:bold;">';
  headers.forEach(function(h){ html += '<th style="padding:6px;">'+h+'</th>'; }); html += '</tr>';
  editaisAtuais.forEach(function(e) {
    var m = (e.relevancia && e.relevancia.matches) || []; var v = e.valorTotalEstimado || 0;
    var fav = favoritosAtual[e.numeroControlePNCP] || '';
    html += '<tr><td>'+(e.orgaoNome||'')+'</td><td>'+(e.nomeUnidadeOrgao||'')+'</td><td>'+(e.modalidadeNome||'')+'</td><td>'+(e.uf||'')+'</td><td>'+(e.municipioNome||'')+'</td><td>'+(e.objetoCompra||'').replace(/</g,'&lt;')+'</td><td style="text-align:right;">'+(v>0?'R$ '+v.toFixed(2).replace('.',','):'')+'</td><td>'+(e.dataAberturaProposta||'')+'</td><td>'+(e.dataEncerramentoProposta||'')+'</td><td>'+(e.situacaoCompraNome||'')+'</td><td>'+(e.cnpjOrgao||'')+'</td><td>'+(e.processo||'')+'</td><td>'+(e.numeroCompra||'')+'/'+(e.anoCompra||'')+'</td><td style="text-align:center;">'+((e.relevancia&&e.relevancia.score)||0)+'</td><td>'+m.join(' | ')+'</td><td>'+fav+'</td><td>'+(e.linkSistemaOrigem||'')+'</td></tr>';
  });
  html += '</table>';
  var blob = new Blob(['\ufeff'+html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  var url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'editais_'+new Date().toISOString().slice(0,10)+'.xls'; a.click(); URL.revokeObjectURL(url);
}

function toggleFiltroInteligente() { var sec = document.getElementById('filtroInteligente'); if (sec) sec.classList.toggle('contraido'); }

async function init() {
  try { var f = await window.pncpAPI.obterFeedback(); if (f.success) feedbackAtual = f.data; } catch(e) {}
  try { var fav = await window.pncpAPI.obterFavoritos(); if (fav.success) favoritosAtual = fav.data; } catch(e) {}
  carregarBuscasSalvas();
}

document.getElementById('btnBuscar').addEventListener('click', buscarEditais);
document.getElementById('btnExportar').addEventListener('click', exportarExcel);
document.getElementById('btnSalvarBusca').addEventListener('click', salvarBuscaAtual);
document.getElementById('closeModal').addEventListener('click', function(){ document.getElementById('modal').className = 'modal-hidden'; });
document.getElementById('modal').addEventListener('click', function(e){ if (e.target.id === 'modal') document.getElementById('modal').className = 'modal-hidden'; });
document.getElementById('closeModalFeedback').addEventListener('click', function(){ document.getElementById('modalFeedback').className = 'modal-hidden'; });
document.getElementById('modalFeedback').addEventListener('click', function(e){ if (e.target.id === 'modalFeedback') document.getElementById('modalFeedback').className = 'modal-hidden'; });
document.getElementById('uf').addEventListener('change', function(){ carregarCidades(this.value); });
document.getElementById('buscaTexto').addEventListener('input', function(){ paginaAtual = 1; aplicarFiltrosTela(); });
document.getElementById('ordenacao').addEventListener('change', function(){ paginaAtual = 1; aplicarFiltrosTela(); });
document.getElementById('btnLimparCache').addEventListener('click', async function(){ var b=this; b.textContent='⏳...'; await window.pncpAPI.limparCache(); b.textContent='✅ Limpo!'; mostrarStatus('🗑️ Cache limpo.','success'); setTimeout(function(){ b.textContent='🗑️ Cache'; },2000); });
document.getElementById('btnFeedback').addEventListener('click', abrirPainelFeedback);

var hoje = new Date();
document.getElementById('dataInicial').valueAsDate = hoje;
document.getElementById('dataFinal').valueAsDate = hoje;
init();

window.abrirDetalhes = abrirDetalhes;
window.carregarItens = carregarItens;
window.carregarArquivos = carregarArquivos;
window.voltarDetalhes = voltarDetalhes;
window.marcarItem = marcarItem;
window.marcarFavorito = marcarFavorito;
window.salvarNota = salvarNota;
window.abrirPainelFeedback = abrirPainelFeedback;
window.removerFeedbackItem = removerFeedbackItem;
window.carregarBusca = carregarBusca;
window.removerBusca = removerBusca;
window.mudarPagina = mudarPagina;
window.criarLembreteCalendario = criarLembreteCalendario;
window.toggleFiltroInteligente = toggleFiltroInteligente;
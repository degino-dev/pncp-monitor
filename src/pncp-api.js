const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://pncp.gov.br/api/consulta';
const PNCP_URL = 'https://pncp.gov.br/api/pncp';

const MODALIDADES = {
  1: 'Concorrência', 2: 'Tomada de Preços', 3: 'Convite', 4: 'Concurso',
  5: 'Leilão', 6: 'Pregão', 7: 'Diálogo Competitivo', 8: 'Pregão Eletrônico',
  9: 'Dispensa de Licitação', 10: 'Inexigibilidade', 11: 'Não se aplica', 12: 'Credenciamento',
};

// ===== Cache persistente (memória + disco) =====
var cache = {};
var cacheDir = null;
var CACHE_TTL_EDITAIS = 30 * 60 * 1000;
var CACHE_TTL_DETALHES = 60 * 60 * 1000;
var CACHE_TTL_ITENS = 60 * 60 * 1000;
var CACHE_TTL_ORGAO = 60 * 60 * 1000;

function setCacheDir(dir) {
  cacheDir = dir;
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  try {
    var files = fs.readdirSync(dir);
    files.forEach(function(f) {
      if (f.endsWith('.json')) {
        try {
          var dados = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          var key = f.replace('.json', '');
          cache[key] = dados;
        } catch(e) {}
      }
    });
  } catch(e) {}
}

function gerarCacheKey(prefixo, params) {
  var keys = Object.keys(params).sort();
  return prefixo + '_' + keys.map(function(k) { return k + '=' + params[k]; }).join('&');
}

function sanitizarKey(key) {
  return key.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function obterCache(key, ttl) {
  if (cache[key]) {
    var idade = Date.now() - cache[key].timestamp;
    if (idade < ttl) {
      var data = cache[key].data;
      if (Array.isArray(data)) {
        var arr = data.slice();
        arr.fromCache = true;
        return arr;
      }
      return Object.assign({}, data, { fromCache: true });
    }
    delete cache[key];
  }
  if (cacheDir) {
    var filePath = path.join(cacheDir, sanitizarKey(key) + '.json');
    if (fs.existsSync(filePath)) {
      try {
        var dados = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        var idadeArq = Date.now() - dados.timestamp;
        if (idadeArq < ttl) {
          cache[key] = dados;
          if (Array.isArray(dados.data)) {
            var arr2 = dados.data.slice();
            arr2.fromCache = true;
            return arr2;
          }
          return Object.assign({}, dados.data, { fromCache: true });
        }
        fs.unlinkSync(filePath);
      } catch(e) { try { fs.unlinkSync(filePath); } catch(e2) {} }
    }
  }
  return null;
}

function salvarCache(key, data) {
  cache[key] = { data: data, timestamp: Date.now() };
  if (cacheDir) {
    try {
      fs.writeFileSync(path.join(cacheDir, sanitizarKey(key) + '.json'), JSON.stringify({ data: data, timestamp: Date.now() }), 'utf8');
    } catch(e) {}
  }
}

function limparCache() {
  cache = {};
  if (cacheDir) {
    try {
      fs.readdirSync(cacheDir).forEach(function(f) {
        if (f.endsWith('.json')) { try { fs.unlinkSync(path.join(cacheDir, f)); } catch(e) {} }
      });
    } catch(e) {}
  }
}

function estatisticasCache() {
  var memoria = Object.keys(cache).length;
  var disco = 0;
  if (cacheDir) {
    try { disco = fs.readdirSync(cacheDir).filter(function(f) { return f.endsWith('.json'); }).length; } catch(e) {}
  }
  return { memoria: memoria, disco: disco };
}

function formatarData(date) {
  var ano = date.getFullYear();
  var mes = String(date.getMonth() + 1).padStart(2, '0');
  var dia = String(date.getDate()).padStart(2, '0');
  return ano + mes + dia;
}

function normalizarEdital(edital) {
  return {
    numeroControlePNCP: edital.numeroControlePNCP || '',
    objetoCompra: edital.objetoCompra || 'Não informado',
    informacaoComplementar: edital.informacaoComplementar || '',
    valorTotalEstimado: edital.valorTotalEstimado || 0,
    valorTotalHomologado: edital.valorTotalHomologado || 0,
    dataAberturaProposta: edital.dataAberturaProposta || null,
    dataEncerramentoProposta: edital.dataEncerramentoProposta || null,
    linkSistemaOrigem: edital.linkSistemaOrigem || '',
    linkProcessoEletronico: edital.linkProcessoEletronico || '',
    processo: edital.processo || '',
    numeroCompra: edital.numeroCompra || '',
    anoCompra: edital.anoCompra || '',
    dataPublicacaoPncp: edital.dataPublicacaoPncp || '',
    dataInclusao: edital.dataInclusao || '',
    dataAtualizacao: edital.dataAtualizacao || '',
    orgaoNome: edital.orgaoEntidade ? edital.orgaoEntidade.razaoSocial || 'Órgão não informado' : 'Órgão não informado',
    cnpjOrgao: edital.orgaoEntidade ? edital.orgaoEntidade.cnpj || '' : '',
    poderId: edital.orgaoEntidade ? edital.orgaoEntidade.poderId || '' : '',
    esferaId: edital.orgaoEntidade ? edital.orgaoEntidade.esferaId || '' : '',
    nomeUnidadeOrgao: edital.unidadeOrgao ? edital.unidadeOrgao.nomeUnidade || '' : '',
    uf: edital.unidadeOrgao ? edital.unidadeOrgao.ufSigla || '' : '',
    ufNome: edital.unidadeOrgao ? edital.unidadeOrgao.ufNome || '' : '',
    codigoMunicipioIbge: edital.unidadeOrgao ? edital.unidadeOrgao.codigoIbge || '' : '',
    municipioNome: edital.unidadeOrgao ? edital.unidadeOrgao.municipioNome || '' : '',
    modalidadeId: edital.modalidadeId || 0,
    modalidadeNome: edital.modalidadeNome || MODALIDADES[edital.modalidadeId] || 'Desconhecida',
    modoDisputaId: edital.modoDisputaId || 0,
    modoDisputaNome: edital.modoDisputaNome || '',
    situacaoCompraId: edital.situacaoCompraId || 0,
    situacaoCompraNome: edital.situacaoCompraNome || '',
    srp: edital.srp || false,
    amparoLegal: edital.amparoLegal || null,
    tipoInstrumentoConvocatorioNome: edital.tipoInstrumentoConvocatorioNome || '',
    tipoInstrumentoConvocatorioCodigo: edital.tipoInstrumentoConvocatorioCodigo || 0,
  };
}

var HEADERS = {
  'Accept': '*/*',
  'User-Agent': 'PNCP-Monitor-DCC/1.0 (Windows; Distribuidora Decio Camargo)',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

async function fetchEditais(params) {
  var cacheKey = gerarCacheKey('editais', params);
  var cached = obterCache(cacheKey, CACHE_TTL_EDITAIS);
  if (cached) return cached;

  var queryParams = {
    dataInicial: params.dataInicial, dataFinal: params.dataFinal,
    pagina: params.pagina || 1, tamanhoPagina: params.tamanhoPagina || 50,
  };
  if (params.uf) queryParams.uf = params.uf;
  if (params.codigoMunicipioIbge) queryParams.codigoMunicipioIbge = params.codigoMunicipioIbge;
  if (params.cnpj) queryParams.cnpj = params.cnpj;
  if (params.codigoModalidadeContratacao) queryParams.codigoModalidadeContratacao = params.codigoModalidadeContratacao;

  for (var tentativa = 1; tentativa <= 5; tentativa++) {
    try {
      var response = await axios.get(BASE_URL + '/v1/contratacoes/proposta', {
        params: queryParams, headers: HEADERS, timeout: 30000,
      });
      var resultado = response.data || {};
      var editais = Array.isArray(resultado.data) ? resultado.data : [];
      var dadosRetorno = {
        totalRegistros: resultado.totalRegistros || editais.length,
        totalPaginas: resultado.totalPaginas || 1,
        pagina: resultado.numeroPagina || queryParams.pagina,
        paginasRestantes: resultado.paginasRestantes || 0,
        editais: editais.map(normalizarEdital), fromCache: false,
      };
      salvarCache(cacheKey, dadosRetorno);
      return dadosRetorno;
    } catch (error) {
      var status = error.response ? error.response.status : 0;
      if ((status >= 500 || status === 429 || error.code === 'ECONNABORTED') && tentativa < 5) {
        await new Promise(function(r) { setTimeout(r, tentativa * 5000); }); continue;
      }
      var msg = error.message;
      if (error.response) {
        var d = error.response.data;
        if (status === 429) msg = 'Limite de requisições excedido. Aguarde 1 minuto e tente novamente.';
        else if (status >= 500) msg = 'Servidor do PNCP sobrecarregado (' + status + ')';
        else if (d && d.message) msg = 'Erro ' + status + ': ' + d.message;
        else msg = 'Erro ' + status + ' ao consultar a API';
      } else if (error.code === 'ECONNABORTED') msg = 'Tempo limite excedido (30s).';
      throw new Error(msg);
    }
  }
}

async function fetchDetalhesContratacao(numeroControlePNCP) {
  var cacheKey = 'detalhes_' + numeroControlePNCP;
  var cached = obterCache(cacheKey, CACHE_TTL_DETALHES);
  if (cached) return cached;
  for (var t = 1; t <= 3; t++) {
    try {
      var response = await axios.get(BASE_URL + '/v1/contratacoes/' + encodeURIComponent(numeroControlePNCP), {
        headers: HEADERS, timeout: 30000,
      });
      salvarCache(cacheKey, response.data);
      return response.data;
    } catch (error) {
      if (t < 3 && (error.code === 'ECONNABORTED' || (error.response && error.response.status >= 500))) {
        await new Promise(function(r) { setTimeout(r, t * 5000); }); continue;
      }
      throw new Error('Erro ao buscar detalhes');
    }
  }
}

async function fetchItens(numeroControlePNCP) {
  var cacheKey = 'itens_' + numeroControlePNCP;
  var cached = obterCache(cacheKey, CACHE_TTL_ITENS);
  if (cached) {
    if (!Array.isArray(cached)) cached = [];
    return cached;
  }

  var partes = numeroControlePNCP.split('-');
  var cnpj = partes[0];
  var seqAno = partes[2] || '';
  var seqAnoPartes = seqAno.split('/');
  var seq = seqAnoPartes[0], ano = seqAnoPartes[1];

  var urls = [
    BASE_URL + '/v1/orgaos/' + cnpj + '/compras/' + ano + '/' + seq + '/itens?pagina=1&tamanhoPagina=100',
    PNCP_URL + '/v1/orgaos/' + cnpj + '/compras/' + ano + '/' + seq + '/itens?pagina=1&tamanhoPagina=100',
    BASE_URL + '/v1/contratacoes/' + encodeURIComponent(numeroControlePNCP) + '/itens?pagina=1&tamanhoPagina=100',
  ];

  var ultimoErro = '';
  for (var i = 0; i < urls.length; i++) {
    for (var t = 1; t <= 3; t++) {
      try {
        var response = await axios.get(urls[i], { headers: HEADERS, timeout: 30000 });
        var resultado = response.data || {};
        var itens = Array.isArray(resultado) ? resultado : (resultado.data || []);
        if (itens.length > 0) {
          var normalizados = itens.map(function(item) {
            return {
              numero: item.numeroItem || item.numero || 0,
              descricao: item.descricaoItem || item.descricao || 'Não informado',
              quantidade: item.quantidade || 0,
              unidadeMedida: item.unidadeMedida || '',
              valorUnitario: item.valorUnitarioEstimado || item.valorUnitario || 0,
              valorTotal: item.valorTotalEstimado || item.valorTotal || 0,
            };
          });
          salvarCache(cacheKey, normalizados);
          return normalizados;
        }
        break;
      } catch (error) {
        var st = error.response ? error.response.status : 0;
        if (t < 3 && (st >= 500 || st === 429 || error.code === 'ECONNABORTED')) {
          await new Promise(function(r) { setTimeout(r, t * 3000); }); continue;
        }
        ultimoErro = st === 404 ? 'Itens não disponíveis para este edital.' : 'Erro ' + st + ' ao buscar itens';
        break;
      }
    }
  }
  throw new Error(ultimoErro || 'Itens não disponíveis para este edital.');
}

async function fetchArquivos(numeroControlePNCP) {
  var cacheKey = 'arquivos_' + numeroControlePNCP;
  var cached = obterCache(cacheKey, CACHE_TTL_ITENS);
  if (cached) {
    if (!Array.isArray(cached)) cached = [];
    return cached;
  }

  var partes = numeroControlePNCP.split('-');
  var cnpj = partes[0];
  var seqAno = partes[2] || '';
  var seqAnoPartes = seqAno.split('/');
  var seq = seqAnoPartes[0], ano = seqAnoPartes[1];

  var urls = [
    BASE_URL + '/v1/orgaos/' + cnpj + '/compras/' + ano + '/' + seq + '/arquivos',
    PNCP_URL + '/v1/orgaos/' + cnpj + '/compras/' + ano + '/' + seq + '/arquivos',
  ];

  var ultimoErro = '';
  for (var i = 0; i < urls.length; i++) {
    for (var t = 1; t <= 3; t++) {
      try {
        var response = await axios.get(urls[i], { headers: HEADERS, timeout: 30000 });
        var resultado = response.data || {};
        var docs = resultado.documentos || (Array.isArray(resultado) ? resultado : (resultado.data || []));
        if (docs.length > 0) {
          var normalizados = docs.map(function(doc) {
            return {
              sequencial: doc.sequencialDocumento || 0,
              titulo: doc.titulo || 'Sem título',
              tipo: doc.tipoDocumentoNome || 'Documento',
              url: doc.url || '',
              dataPublicacao: doc.dataPublicacaoPncp || '',
            };
          });
          salvarCache(cacheKey, normalizados);
          return normalizados;
        }
        return [];
      } catch (error) {
        var st = error.response ? error.response.status : 0;
        if (t < 3 && (st >= 500 || st === 429 || error.code === 'ECONNABORTED')) {
          await new Promise(function(r) { setTimeout(r, t * 3000); }); continue;
        }
        ultimoErro = st === 404 ? 'Arquivos não disponíveis.' : 'Erro ' + st + ' ao buscar arquivos';
        break;
      }
    }
  }
  if (ultimoErro) throw new Error(ultimoErro);
  return [];
}

async function fetchOrgao(cnpj) {
  var cnpjLimpo = cnpj.replace(/\D/g, '');
  var cacheKey = 'orgao_' + cnpjLimpo;
  var cached = obterCache(cacheKey, CACHE_TTL_ORGAO);
  if (cached) return cached;
  try {
    var response = await axios.get(BASE_URL + '/v1/orgaos/' + cnpjLimpo, { headers: HEADERS, timeout: 30000 });
    salvarCache(cacheKey, response.data);
    return response.data;
  } catch (error) { throw new Error('Erro ao buscar órgão'); }
}

module.exports = {
  fetchEditais, fetchDetalhesContratacao, fetchOrgao, normalizarEdital,
  formatarData, MODALIDADES, fetchItens, fetchArquivos, limparCache, estatisticasCache, setCacheDir,
};
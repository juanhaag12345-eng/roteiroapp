const DIA_LABELS = {
  seg: 'Segunda-feira', ter: 'Terca-feira', qua: 'Quarta-feira',
  qui: 'Quinta-feira', sex: 'Sexta-feira', sab: 'Sabado', dom: 'Domingo',
};
// getDay(): 0=domingo ... 6=sabado
const DIA_POR_JS_DAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

const selVendedor = document.getElementById('selVendedor');
const selDia = document.getElementById('selDia');
const msgRota = document.getElementById('msgRota');
const listaParadas = document.getElementById('listaParadas');
const statsRota = document.getElementById('statsRota');
const erroRastreio = document.getElementById('erroRastreio');
const btnNavegar = document.getElementById('btnNavegar');
const btnPararNav = document.getElementById('btnPararNav');
const navCard = document.getElementById('navCard');
const navSeta = document.getElementById('navSeta');
const navTexto = document.getElementById('navTexto');
const navSub = document.getElementById('navSub');
const navDistancia = document.getElementById('navDistancia');

let map, origemLayer, paradasLayer, linhaLayer, minhaLocLayer;
let vendedores = [];
let rotaAtual = null; // resposta de /api/rota/:id/:dia
let socket;
let watchId = null;
let vendedorRastreado = null;

// ---------------- guia de navegacao (turn-by-turn) ----------------
const CHEGADA_METROS = 35;
let guiaSteps = [];
let guiaIdx = 0;
let navegando = false;
let navMapCentralizado = false;

function initMap() {
  map = L.map('mapa').setView([-23.5505, -46.6333], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
}

function numeroIcon(numero, cor) {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${cor || '#1d3557'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.4)">${numero}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function origemIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.4)">P</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

async function carregarVendedores() {
  const resp = await fetch('/api/vendedores');
  vendedores = await resp.json();
  selVendedor.innerHTML = vendedores
    .map((v) => `<option value="${v.id}">${v.nome}</option>`)
    .join('');
}

function preencherDias() {
  const dias = ['seg', 'ter', 'qua', 'qui', 'sex'];
  selDia.innerHTML = dias.map((d) => `<option value="${d}">${DIA_LABELS[d]}</option>`).join('');
  const hoje = DIA_POR_JS_DAY[new Date().getDay()];
  if (dias.includes(hoje)) selDia.value = hoje;
}

function limparMapaRota() {
  [origemLayer, paradasLayer, linhaLayer].forEach((l) => l && map.removeLayer(l));
}

async function tracarRota() {
  const vendedorId = selVendedor.value;
  const dia = selDia.value;
  if (!vendedorId) return;

  pararNavegacao();
  btnNavegar.style.display = 'none';
  msgRota.innerHTML = '<p class="small">Calculando a melhor rota...</p>';
  statsRota.style.display = 'none';
  listaParadas.innerHTML = '';

  try {
    const resp = await fetch(`/api/rota/${vendedorId}/${dia}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao calcular rota.');

    rotaAtual = data;
    msgRota.innerHTML = '';

    if (data.paradas.length === 0) {
      msgRota.innerHTML = `<div class="aviso">Nenhum cliente cadastrado para ${DIA_LABELS[dia]} para este vendedor. Cadastre visitas na tela de <a href="/cadastro.html">cadastro</a>.</div>`;
      return;
    }

    limparMapaRota();

    origemLayer = L.marker([data.origem.lat, data.origem.lng], { icon: origemIcon() })
      .addTo(map)
      .bindPopup(`<strong>Ponto de partida</strong><br>${data.vendedor.origemEndereco}`);

    const marcadores = data.paradas.map((p) =>
      L.marker([p.cliente.lat, p.cliente.lng], { icon: numeroIcon(p.posicao, data.vendedor.cor) })
        .bindPopup(`<strong>${p.posicao}. ${p.cliente.nome}</strong><br>${p.cliente.endereco}`)
    );
    paradasLayer = L.layerGroup(marcadores).addTo(map);

    const linhaCoords = data.geometryLatLng.map((p) => [p.lat, p.lng]);
    linhaLayer = L.polyline(linhaCoords, { color: data.vendedor.cor, weight: 4, opacity: 0.8 }).addTo(map);

    const bounds = L.latLngBounds(linhaCoords);
    map.fitBounds(bounds, { padding: [30, 30] });

    document.getElementById('statDistancia').textContent = `${data.distanciaKm} km`;
    document.getElementById('statDuracao').textContent = `${data.duracaoMin} min`;
    document.getElementById('statParadas').textContent = data.paradas.length;
    document.getElementById('statFonte').textContent =
      data.fonte === 'osrm' ? 'ruas reais (OSRM)' : 'estimativa em linha reta';
    statsRota.style.display = 'flex';

    listaParadas.innerHTML = data.paradas
      .map(
        (p) => `<li><span class="badge-ordem">${p.posicao}</span><div><strong>${p.cliente.nome}</strong><br><span class="small">${p.cliente.endereco}</span></div></li>`
      )
      .join('');

    btnNavegar.style.display = 'inline-block';
  } catch (err) {
    msgRota.innerHTML = `<div class="erro">${err.message}</div>`;
  }
}

// ---------------- rastreamento em tempo real (sempre ativo, sem UI de sucesso) ----------------
// Nao ha botao de ligar/desligar: assim que um vendedor e identificado nesta
// tela, o rastreamento por GPS comeca automaticamente e fica ativo enquanto a
// aba estiver aberta. So aparece um aviso na tela se o GPS realmente falhar
// (permissao negada, sem sinal, etc.) - quando esta funcionando, fica silencioso.

function garantirSocket() {
  if (!socket) socket = io();
  return socket;
}

function marcarMinhaLocalizacao(lat, lng) {
  if (!minhaLocLayer) {
    minhaLocLayer = L.circleMarker([lat, lng], {
      radius: 9, color: '#fff', weight: 2, fillColor: '#e63946', fillOpacity: 1,
    }).addTo(map);
  } else {
    minhaLocLayer.setLatLng([lat, lng]);
  }
}

function mostrarErroGPS(err) {
  if (!erroRastreio) return;
  let msg;
  if (err.code === 1) {
    msg = 'Permissao de localizacao negada. Va nas configuracoes do navegador (ou do celular) e permita o acesso a localizacao para este site, depois recarregue a pagina.';
  } else if (err.code === 2) {
    msg = 'Nao foi possivel obter sua localizacao agora. Verifique se o GPS do celular esta ligado.';
  } else {
    msg = 'Tempo esgotado tentando obter sua localizacao. Verifique o GPS e a conexao do celular.';
  }
  erroRastreio.textContent = 'Rastreamento: ' + msg;
  erroRastreio.style.display = 'block';
}

function esconderErroGPS() {
  if (!erroRastreio) return;
  erroRastreio.style.display = 'none';
  erroRastreio.textContent = '';
}

function pararRastreio() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (socket && vendedorRastreado) socket.emit('vendedor:offline', { vendedorId: vendedorRastreado });
  vendedorRastreado = null;
  pararNavegacao();
}

function iniciarRastreioAutomatico(vendedorId) {
  pararRastreio();
  esconderErroGPS();
  if (!vendedorId) return;

  if (!('geolocation' in navigator)) {
    if (erroRastreio) {
      erroRastreio.textContent = 'Rastreamento: este navegador nao suporta compartilhamento de localizacao.';
      erroRastreio.style.display = 'block';
    }
    return;
  }

  vendedorRastreado = vendedorId;
  const s = garantirSocket();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      marcarMinhaLocalizacao(lat, lng);
      s.emit('vendedor:location', { vendedorId, lat, lng, tracking: 'gps', dia: selDia.value });
      esconderErroGPS();
      processarPosicaoNavegacao(lat, lng);
    },
    (err) => {
      console.warn('Erro de GPS:', err.message);
      mostrarErroGPS(err);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

// ---------------- guia de navegacao (turn-by-turn) ----------------

const SETAS_MODIFICADOR = {
  straight: '\u2191', 'slight right': '\u2197', right: '\u2192', 'sharp right': '\u2198',
  uturn: '\u2193', 'sharp left': '\u2199', left: '\u2190', 'slight left': '\u2196',
};

function setaParaManobra(step) {
  if (step.type === 'depart') return '\u2191';
  if (step.type === 'arrive') return '\u2691';
  if (step.type === 'roundabout' || step.type === 'rotary') return '\u21bb';
  return SETAS_MODIFICADOR[step.modifier] || '\u2191';
}

function textoManobra(step) {
  const rua = step.streetName ? ` na ${step.streetName}` : '';
  const nomesModificador = {
    uturn: 'Faca o retorno',
    'sharp right': 'Vire fortemente a direita',
    right: 'Vire a direita',
    'slight right': 'Mantenha-se levemente a direita',
    straight: 'Siga em frente',
    'slight left': 'Mantenha-se levemente a esquerda',
    left: 'Vire a esquerda',
    'sharp left': 'Vire fortemente a esquerda',
  };
  switch (step.type) {
    case 'depart':
      return `Siga${rua}`;
    case 'arrive':
      return 'Voce chegou ao destino';
    case 'roundabout':
    case 'rotary':
      return `Entre na rotatoria${rua}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Saia da rotatoria${rua}`;
    case 'merge':
      return `Siga${rua}`;
    case 'on ramp':
      return `Entre na rampa${rua}`;
    case 'off ramp':
      return `Saia na rampa${rua}`;
    default:
      return `${nomesModificador[step.modifier] || 'Continue'}${rua}`;
  }
}

function construirGuiaSteps(data) {
  if (data.steps && data.steps.length) {
    return data.steps.map((step) => ({
      instrucao: textoManobra(step),
      seta: setaParaManobra(step),
      lat: step.lat,
      lng: step.lng,
      legIndex: step.legIndex,
      chegada: step.type === 'arrive',
      distanciaInicial: step.distanceM,
    }));
  }
  return data.paradas.map((p, idx) => ({
    instrucao: `Siga em direcao a ${p.cliente.nome} (linha reta, sem rota de ruas disponivel)`,
    seta: '\u2191',
    lat: p.cliente.lat,
    lng: p.cliente.lng,
    legIndex: idx,
    chegada: true,
    distanciaInicial: null,
  }));
}

function formatarDistancia(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function haversineMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function iniciarNavegacao() {
  if (!rotaAtual || !rotaAtual.paradas || rotaAtual.paradas.length === 0) return;
  guiaSteps = construirGuiaSteps(rotaAtual);
  guiaIdx = 0;
  navegando = true;
  navMapCentralizado = false;
  navCard.style.display = 'block';
  atualizarPainelNav();
  navCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pararNavegacao() {
  navegando = false;
  navCard.style.display = 'none';
}

function atualizarPainelNav(distanciaMetros) {
  if (guiaIdx >= guiaSteps.length) {
    navTexto.textContent = 'Rota concluida!';
    navSub.textContent = '';
    navSeta.textContent = '\u2691';
    navDistancia.textContent = '';
    return;
  }
  const passo = guiaSteps[guiaIdx];
  navSeta.textContent = passo.seta;
  navTexto.textContent = passo.instrucao;
  const parada = rotaAtual.paradas[passo.legIndex];
  navSub.textContent = parada ? `Indo para: ${parada.cliente.nome}` : '';
  const dist = distanciaMetros != null ? distanciaMetros : passo.distanciaInicial;
  navDistancia.textContent = dist != null ? formatarDistancia(dist) : '';
}

function processarPosicaoNavegacao(lat, lng) {
  if (!navegando) return;

  if (!navMapCentralizado) {
    map.setView([lat, lng], 17);
    navMapCentralizado = true;
  } else {
    map.panTo([lat, lng]);
  }

  if (guiaIdx >= guiaSteps.length) return;

  const passo = guiaSteps[guiaIdx];
  const distancia = haversineMetros(lat, lng, passo.lat, passo.lng);

  if (distancia < CHEGADA_METROS) {
    if (passo.chegada) {
      const parada = rotaAtual.paradas[passo.legIndex];
      navSeta.textContent = '\u2713';
      navTexto.textContent = parada ? `Voce chegou: ${parada.cliente.nome}` : 'Voce chegou!';
      navSub.textContent = '';
      navDistancia.textContent = '';
      guiaIdx++;
      if (guiaIdx >= guiaSteps.length) {
        navSub.textContent = 'Rota concluida!';
      }
      return;
    }
    guiaIdx++;
  }

  atualizarPainelNav(distancia);
}

document.getElementById('btnTracar').addEventListener('click', tracarRota);
btnNavegar.addEventListener('click', iniciarNavegacao);
btnPararNav.addEventListener('click', pararNavegacao);

selVendedor.addEventListener('change', () => {
  btnNavegar.style.display = 'none';
  msgRota.innerHTML = '';
  statsRota.style.display = 'none';
  listaParadas.innerHTML = '';
  limparMapaRota();
  rotaAtual = null;
  iniciarRastreioAutomatico(selVendedor.value);
});

window.addEventListener('beforeunload', pararRastreio);

(async function start() {
  initMap();
  preencherDias();
  await carregarVendedores();
  if (selVendedor.value) iniciarRastreioAutomatico(selVendedor.value);
})();

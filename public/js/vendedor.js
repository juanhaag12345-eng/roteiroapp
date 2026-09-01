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

let map, origemLayer, paradasLayer, linhaLayer, minhaLocLayer;
let vendedores = [];
let rotaAtual = null; // resposta de /api/rota/:id/:dia
let socket;
let watchId = null;
let vendedorRastreado = null;

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
  } catch (err) {
    msgRota.innerHTML = `<div class="erro">${err.message}</div>`;
  }
}

// ---------------- rastreamento em tempo real (sempre ativo, sem UI) ----------------
// Nao ha botao de ligar/desligar nem indicador visual: assim que um vendedor e
// identificado nesta tela, o rastreamento por GPS comeca automaticamente e fica
// ativo enquanto a aba estiver aberta, para o gestor poder acompanhar quando quiser.

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

function pararRastreio() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (socket && vendedorRastreado) socket.emit('vendedor:offline', { vendedorId: vendedorRastreado });
  vendedorRastreado = null;
}

function iniciarRastreioAutomatico(vendedorId) {
  pararRastreio();
  if (!vendedorId || !('geolocation' in navigator)) return;

  vendedorRastreado = vendedorId;
  const s = garantirSocket();
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      marcarMinhaLocalizacao(lat, lng);
      s.emit('vendedor:location', { vendedorId, lat, lng, tracking: 'gps', dia: selDia.value });
    },
    (err) => {
      console.warn('Erro de GPS:', err.message);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

document.getElementById('btnTracar').addEventListener('click', tracarRota);

selVendedor.addEventListener('change', () => {
  iniciarRastreioAutomatico(selVendedor.value);
});

window.addEventListener('beforeunload', pararRastreio);

(async function start() {
  initMap();
  preencherDias();
  await carregarVendedores();
  if (selVendedor.value) iniciarRastreioAutomatico(selVendedor.value);
})();

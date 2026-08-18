const DIA_LABELS = {
  seg: 'Segunda-feira', ter: 'Terça-feira', qua: 'Quarta-feira',
  qui: 'Quinta-feira', sex: 'Sexta-feira',
};
const DIA_POR_JS_DAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const ONLINE_THRESHOLD_MS = 20000; // considera "em rota" se atualizou nos últimos 20s

let map;
let vendedores = [];
let localizacoes = {}; // vendedorId -> {lat,lng,updatedAt,tracking}
let marcadores = {}; // vendedorId -> L.CircleMarker
let selecionadoId = null;
let rotaPlanejadaLayer = null;

const listaVendedoresEl = document.getElementById('listaVendedores');
const selDiaGestor = document.getElementById('selDiaGestor');

function initMap() {
  map = L.map('mapaGestor').setView([-23.5615, -46.6558], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
}

function preencherDias() {
  const dias = ['seg', 'ter', 'qua', 'qui', 'sex'];
  selDiaGestor.innerHTML = dias.map((d) => `<option value="${d}">${DIA_LABELS[d]}</option>`).join('');
  const hoje = DIA_POR_JS_DAY[new Date().getDay()];
  if (dias.includes(hoje)) selDiaGestor.value = hoje;
}

function tempoRelativo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s}s`;
  return `há ${Math.round(s / 60)}min`;
}

function estaOnline(vendedorId) {
  const loc = localizacoes[vendedorId];
  return !!loc && Date.now() - loc.updatedAt < ONLINE_THRESHOLD_MS;
}

function renderLista() {
  listaVendedoresEl.innerHTML = vendedores
    .map((v) => {
      const online = estaOnline(v.id);
      const loc = localizacoes[v.id];
      const selecionado = v.id === selecionadoId ? 'style="background:#f0f4f8"' : '';
      return `
        <div class="vendedor-item" data-id="${v.id}" ${selecionado}>
          <span class="dot" style="background:${v.cor}"></span>
          <div style="flex:1">
            <div><strong>${v.nome}</strong></div>
            <div class="small">${loc ? tempoRelativo(loc.updatedAt) : 'sem sinal ainda'}</div>
          </div>
          <span class="pill ${online ? 'online' : 'offline'}">${online ? 'Em rota' : 'Offline'}</span>
        </div>`;
    })
    .join('');

  listaVendedoresEl.querySelectorAll('.vendedor-item').forEach((el) => {
    el.addEventListener('click', () => {
      selecionadoId = el.dataset.id;
      renderLista();
    });
  });
}

function corDoVendedor(vendedorId) {
  const v = vendedores.find((x) => x.id === vendedorId);
  return v ? v.cor : '#457b9d';
}

function nomeDoVendedor(vendedorId) {
  const v = vendedores.find((x) => x.id === vendedorId);
  return v ? v.nome : 'Vendedor';
}

function atualizarMarcador(vendedorId, lat, lng) {
  if (!marcadores[vendedorId]) {
    marcadores[vendedorId] = L.circleMarker([lat, lng], {
      radius: 10, color: '#fff', weight: 2, fillColor: corDoVendedor(vendedorId), fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip(nomeDoVendedor(vendedorId), { permanent: false });
  } else {
    marcadores[vendedorId].setLatLng([lat, lng]);
  }
}

function removerMarcador(vendedorId) {
  if (marcadores[vendedorId]) {
    map.removeLayer(marcadores[vendedorId]);
    delete marcadores[vendedorId];
  }
}

async function carregarInicial() {
  const [respV, respL] = await Promise.all([fetch('/api/vendedores'), fetch('/api/localizacoes')]);
  vendedores = await respV.json();
  localizacoes = await respL.json();

  Object.entries(localizacoes).forEach(([vendedorId, loc]) => {
    atualizarMarcador(vendedorId, loc.lat, loc.lng);
  });

  if (!selecionadoId && vendedores.length) selecionadoId = vendedores[0].id;
  renderLista();
}

function numeroIcon(numero, cor) {
  return L.divIcon({
    className: '',
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${cor};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.4)">${numero}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

async function verRotaPlanejada() {
  const msg = document.getElementById('msgRotaGestor');
  if (!selecionadoId) {
    msg.innerHTML = '<div class="aviso">Selecione um vendedor na lista.</div>';
    return;
  }
  const dia = selDiaGestor.value;
  msg.innerHTML = '<p class="small">Carregando rota…</p>';

  if (rotaPlanejadaLayer) { map.removeLayer(rotaPlanejadaLayer); rotaPlanejadaLayer = null; }

  try {
    const resp = await fetch(`/api/rota/${selecionadoId}/${dia}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Erro ao calcular rota.');

    if (data.paradas.length === 0) {
      msg.innerHTML = `<div class="aviso">Sem visitas cadastradas para ${DIA_LABELS[dia]}.</div>`;
      return;
    }

    const camadas = [];
    camadas.push(
      L.marker([data.origem.lat, data.origem.lng]).bindPopup(`Ponto de partida: ${data.vendedor.origemEndereco}`)
    );
    data.paradas.forEach((p) => {
      camadas.push(
        L.marker([p.cliente.lat, p.cliente.lng], { icon: numeroIcon(p.posicao, data.vendedor.cor) }).bindPopup(
          `${p.posicao}. ${p.cliente.nome}`
        )
      );
    });
    const linhaCoords = data.geometryLatLng.map((p) => [p.lat, p.lng]);
    camadas.push(L.polyline(linhaCoords, { color: data.vendedor.cor, weight: 4, opacity: 0.7, dashArray: '6 6' }));

    rotaPlanejadaLayer = L.layerGroup(camadas).addTo(map);
    map.fitBounds(L.latLngBounds(linhaCoords), { padding: [30, 30] });

    msg.innerHTML = `<p class="small">${data.paradas.length} paradas · ${data.distanciaKm} km · ${data.duracaoMin} min (${data.fonte === 'osrm' ? 'ruas reais' : 'estimativa'})</p>`;
  } catch (err) {
    msg.innerHTML = `<div class="erro">${err.message}</div>`;
  }
}

document.getElementById('btnVerRota').addEventListener('click', verRotaPlanejada);

(async function start() {
  initMap();
  preencherDias();
  await carregarInicial();

  const socket = io();
  socket.on('gestor:location-update', (payload) => {
    localizacoes[payload.vendedorId] = payload;
    atualizarMarcador(payload.vendedorId, payload.lat, payload.lng);
    renderLista();
  });
  socket.on('gestor:vendedor-offline', (payload) => {
    delete localizacoes[payload.vendedorId];
    removerMarcador(payload.vendedorId);
    renderLista();
  });

  setInterval(renderLista, 5000); // atualiza "há Xs" e pill online/offline
})();

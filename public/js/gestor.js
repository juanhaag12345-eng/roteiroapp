const DIA_LABELS = {
  seg: 'Segunda-feira', ter: 'Terca-feira', qua: 'Quarta-feira',
  qui: 'Quinta-feira', sex: 'Sexta-feira',
};
const DIA_POR_JS_DAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const ONLINE_THRESHOLD_MS = 20000; // considera "em rota" se atualizou nos ultimos 20s

let map;
let vendedores = [];
let clientes = [];
let visitasRoteiro = []; // visitas do vendedor+dia selecionados na tela do gestor
let localizacoes = {}; // vendedorId -> {lat,lng,updatedAt,tracking}
let marcadores = {}; // vendedorId -> L.CircleMarker
let selecionadoId = null;
let rotaPlanejadaLayer = null;

const listaVendedoresEl = document.getElementById('listaVendedores');
const selDiaGestor = document.getElementById('selDiaGestor');

// ---- cadastro de roteiro (agenda dia a dia) direto na tela do gestor ----
const selVendedorRoteiro = document.getElementById('selVendedorRoteiro');
const roteiroSemVendedor = document.getElementById('roteiroSemVendedor');
const roteiroConteudo = document.getElementById('roteiroConteudo');
const roteiroVendedorNome = document.getElementById('roteiroVendedorNome');
const roteiroDiaNome = document.getElementById('roteiroDiaNome');
const listaRoteiro = document.getElementById('listaRoteiro');
const roteiroVazio = document.getElementById('roteiroVazio');
const selClienteRoteiro = document.getElementById('selClienteRoteiro');
const btnAddParada = document.getElementById('btnAddParada');
const msgRoteiro = document.getElementById('msgRoteiro');
const novoClienteNome = document.getElementById('novoClienteNome');
const novoClienteEndereco = document.getElementById('novoClienteEndereco');
const btnNovoClienteParada = document.getElementById('btnNovoClienteParada');
const msgNovoClienteRoteiro = document.getElementById('msgNovoClienteRoteiro');
const novoVendedorNome = document.getElementById('novoVendedorNome');
const novoVendedorEmail = document.getElementById('novoVendedorEmail');
const novoVendedorCor = document.getElementById('novoVendedorCor');
const novoVendedorOrigem = document.getElementById('novoVendedorOrigem');
const btnNovoVendedor = document.getElementById('btnNovoVendedor');
const msgNovoVendedor = document.getElementById('msgNovoVendedor');

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
  if (s < 60) return `ha ${s}s`;
  return `ha ${Math.round(s / 60)}min`;
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
      atualizarRoteiro();
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
  const [respV, respL, respC] = await Promise.all([
    fetch('/api/vendedores'), fetch('/api/localizacoes'), fetch('/api/clientes'),
  ]);
  vendedores = await respV.json();
  localizacoes = await respL.json();
  clientes = await respC.json();

  Object.entries(localizacoes).forEach(([vendedorId, loc]) => {
    atualizarMarcador(vendedorId, loc.lat, loc.lng);
  });

  if (!selecionadoId && vendedores.length) selecionadoId = vendedores[0].id;
  renderLista();
  atualizarRoteiro();
}

// ---------------------------------------------------------------------
// Cadastro de roteiro (agenda dia a dia) direto na tela do gestor — toda
// alteracao aqui grava em /api/visitas, a mesma fonte de dados que
// /api/rota/:vendedorId/:dia usa, entao a tela do vendedor ja reflete o
// roteiro atualizado na proxima vez que ele tracar a rota.
// ---------------------------------------------------------------------

async function carregarClientes() {
  const resp = await fetch('/api/clientes');
  clientes = await resp.json();
}

function renderSelVendedorRoteiro() {
  selVendedorRoteiro.innerHTML = vendedores.length
    ? vendedores.map((v) => `<option value="${v.id}">${v.nome}</option>`).join('')
    : '<option value="">Nenhum vendedor cadastrado</option>';
  if (selecionadoId) selVendedorRoteiro.value = selecionadoId;
}

async function atualizarRoteiro() {
  renderSelVendedorRoteiro();

  if (!selecionadoId) {
    roteiroSemVendedor.style.display = '';
    roteiroConteudo.style.display = 'none';
    return;
  }
  roteiroSemVendedor.style.display = 'none';
  roteiroConteudo.style.display = '';

  const dia = selDiaGestor.value;
  roteiroVendedorNome.textContent = nomeDoVendedor(selecionadoId);
  roteiroDiaNome.textContent = DIA_LABELS[dia] || dia;

  const resp = await fetch(`/api/visitas?vendedorId=${selecionadoId}&dia=${dia}`);
  visitasRoteiro = await resp.json();
  renderRoteiro();
}

function renderRoteiro() {
  if (visitasRoteiro.length === 0) {
    listaRoteiro.innerHTML = '';
    roteiroVazio.style.display = '';
  } else {
    roteiroVazio.style.display = 'none';
    listaRoteiro.innerHTML = visitasRoteiro
      .map((vi) => {
        const cli = clientes.find((c) => c.id === vi.clienteId);
        return `
          <li class="item-roteiro">
            <div><strong>${cli ? cli.nome : 'Cliente removido'}</strong><br><span class="small">${cli ? cli.endereco : ''}</span></div>
            <button class="secundario" data-del-visita-roteiro="${vi.id}">remover</button>
          </li>`;
      })
      .join('');
    listaRoteiro.querySelectorAll('[data-del-visita-roteiro]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/visitas/${btn.dataset.delVisitaRoteiro}`, { method: 'DELETE' });
        await atualizarRoteiro();
      });
    });
  }

  const idsJaNoRoteiro = new Set(visitasRoteiro.map((vi) => vi.clienteId));
  const disponiveis = clientes.filter((c) => !idsJaNoRoteiro.has(c.id));
  selClienteRoteiro.innerHTML = disponiveis.length
    ? disponiveis.map((c) => `<option value="${c.id}">${c.nome}</option>`).join('')
    : '<option value="">Nenhum cliente disponivel</option>';
  btnAddParada.disabled = disponiveis.length === 0;
}

btnAddParada.addEventListener('click', async () => {
  if (!selecionadoId || !selClienteRoteiro.value) return;
  msgRoteiro.innerHTML = '';
  const resp = await fetch('/api/visitas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vendedorId: selecionadoId, clienteId: selClienteRoteiro.value, dia: selDiaGestor.value }),
  });
  const data = await resp.json();
  if (!resp.ok) { msgRoteiro.innerHTML = `<div class="erro">${data.error}</div>`; return; }
  await atualizarRoteiro();
});

btnNovoClienteParada.addEventListener('click', async () => {
  if (!selecionadoId) return;
  const nome = novoClienteNome.value.trim();
  const endereco = novoClienteEndereco.value.trim();
  if (!nome || !endereco) {
    msgNovoClienteRoteiro.innerHTML = '<div class="erro">Preencha o nome e o endereco do cliente.</div>';
    return;
  }
  msgNovoClienteRoteiro.innerHTML = '<p class="small">Geocodificando endereco…</p>';
  try {
    const respCliente = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, endereco }),
    });
    const cliente = await respCliente.json();
    if (!respCliente.ok) throw new Error(cliente.error || 'Erro ao cadastrar cliente.');

    await carregarClientes();

    const respVisita = await fetch('/api/visitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendedorId: selecionadoId, clienteId: cliente.id, dia: selDiaGestor.value }),
    });
    const visita = await respVisita.json();
    if (!respVisita.ok) throw new Error(visita.error || 'Erro ao adicionar parada.');

    msgNovoClienteRoteiro.innerHTML = '<div class="sucesso">Cliente cadastrado e adicionado ao roteiro!</div>';
    novoClienteNome.value = '';
    novoClienteEndereco.value = '';
    await atualizarRoteiro();
  } catch (err) {
    msgNovoClienteRoteiro.innerHTML = `<div class="erro">${err.message}</div>`;
  }
});

selDiaGestor.addEventListener('change', atualizarRoteiro);

selVendedorRoteiro.addEventListener('change', () => {
  if (!selVendedorRoteiro.value) return;
  selecionadoId = selVendedorRoteiro.value;
  renderLista();
  atualizarRoteiro();
});

btnNovoVendedor.addEventListener('click', async () => {
  const nome = novoVendedorNome.value.trim();
  const email = novoVendedorEmail.value.trim();
  const cor = novoVendedorCor.value.trim() || '#457b9d';
  const origemEndereco = novoVendedorOrigem.value.trim();
  if (!nome || !origemEndereco) {
    msgNovoVendedor.innerHTML = '<div class="erro">Preencha ao menos o nome e o endereco de partida.</div>';
    return;
  }
  msgNovoVendedor.innerHTML = '<p class="small">Geocodificando endereco…</p>';
  try {
    const resp = await fetch('/api/vendedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, cor, origemEndereco }),
    });
    const vendedor = await resp.json();
    if (!resp.ok) throw new Error(vendedor.error || 'Erro ao cadastrar vendedor.');

    vendedores.push(vendedor);
    selecionadoId = vendedor.id;
    renderLista();
    atualizarRoteiro();

    msgNovoVendedor.innerHTML = '<div class="sucesso">Vendedor cadastrado! Monte o roteiro dele ali em cima.</div>';
    novoVendedorNome.value = '';
    novoVendedorEmail.value = '';
    novoVendedorCor.value = '#457b9d';
    novoVendedorOrigem.value = '';
  } catch (err) {
    msgNovoVendedor.innerHTML = `<div class="erro">${err.message}</div>`;
  }
});

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

  setInterval(renderLista, 5000); // atualiza "ha Xs" e pill online/offline
})();

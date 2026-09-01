const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const db = require('./src/lib/db');
const { geocode } = require('./src/lib/geocode');
const { optimizeRoute } = require('./src/lib/routing');
const { seedIfEmpty, DIAS } = require('./src/lib/seed');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));

// ---------- popular dados de demonstracao no primeiro boot ----------
seedIfEmpty();

// ---------- estado em memoria de localizacao em tempo real ----------
// vendedorId -> { lat, lng, updatedAt, tracking: 'gps' | 'sim', dia }
const localizacoes = {};

// ---------------------------------------------------------------------
// API: vendedores
// ---------------------------------------------------------------------
app.get('/api/vendedores', (req, res) => {
  const data = db.load();
  res.json(data.vendedores);
});

app.post('/api/vendedores', async (req, res) => {
  try {
    const { nome, email, cor, origemEndereco } = req.body;
    if (!nome || !origemEndereco) {
      return res.status(400).json({ error: 'nome e origemEndereco sao obrigatorios.' });
    }
    const geo = await geocode(origemEndereco);
    const data = db.load();
    const vendedor = {
      id: crypto.randomUUID(),
      nome,
      email: email || '',
      cor: cor || '#457b9d',
      origemEndereco,
      origemLat: geo.lat,
      origemLng: geo.lng,
    };
    data.vendedores.push(vendedor);
    db.save(data);
    res.status(201).json(vendedor);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.delete('/api/vendedores/:id', (req, res) => {
  const data = db.load();
  data.vendedores = data.vendedores.filter((v) => v.id !== req.params.id);
  data.visitas = data.visitas.filter((v) => v.vendedorId !== req.params.id);
  db.save(data);
  delete localizacoes[req.params.id];
  res.status(204).end();
});

// ---------------------------------------------------------------------
// API: clientes
// ---------------------------------------------------------------------
app.get('/api/clientes', (req, res) => {
  const data = db.load();
  res.json(data.clientes);
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { nome, endereco } = req.body;
    if (!nome || !endereco) {
      return res.status(400).json({ error: 'nome e endereco sao obrigatorios.' });
    }
    const geo = await geocode(endereco);
    const data = db.load();
    const cliente = { id: crypto.randomUUID(), nome, endereco, lat: geo.lat, lng: geo.lng };
    data.clientes.push(cliente);
    db.save(data);
    res.status(201).json(cliente);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.delete('/api/clientes/:id', (req, res) => {
  const data = db.load();
  data.clientes = data.clientes.filter((c) => c.id !== req.params.id);
  data.visitas = data.visitas.filter((v) => v.clienteId !== req.params.id);
  db.save(data);
  res.status(204).end();
});

// ---------------------------------------------------------------------
// API: visitas (agenda: qual cliente cada vendedor visita em qual dia)
// ---------------------------------------------------------------------
app.get('/api/visitas', (req, res) => {
  const data = db.load();
  let visitas = data.visitas;
  if (req.query.vendedorId) visitas = visitas.filter((v) => v.vendedorId === req.query.vendedorId);
  if (req.query.dia) visitas = visitas.filter((v) => v.dia === req.query.dia);
  res.json(visitas);
});

app.post('/api/visitas', (req, res) => {
  const { vendedorId, clienteId, dia } = req.body;
  if (!vendedorId || !clienteId || !DIAS.includes(dia)) {
    return res.status(400).json({ error: `dados invalidos. dia deve ser um de: ${DIAS.join(', ')}` });
  }
  const data = db.load();
  const visita = { id: crypto.randomUUID(), vendedorId, clienteId, dia };
  data.visitas.push(visita);
  db.save(data);
  res.status(201).json(visita);
});

app.delete('/api/visitas/:id', (req, res) => {
  const data = db.load();
  data.visitas = data.visitas.filter((v) => v.id !== req.params.id);
  db.save(data);
  res.status(204).end();
});

// ---------------------------------------------------------------------
// API: rota otimizada de um vendedor em um dia
// ---------------------------------------------------------------------
app.get('/api/rota/:vendedorId/:dia', async (req, res) => {
  const { vendedorId, dia } = req.params;
  const data = db.load();
  const vendedor = data.vendedores.find((v) => v.id === vendedorId);
  if (!vendedor) return res.status(404).json({ error: 'Vendedor nao encontrado.' });
  if (!DIAS.includes(dia)) return res.status(400).json({ error: `dia invalido. Use um de: ${DIAS.join(', ')}` });

  const visitasDoDia = data.visitas.filter((v) => v.vendedorId === vendedorId && v.dia === dia);
  const clientes = visitasDoDia
    .map((v) => data.clientes.find((c) => c.id === v.clienteId))
    .filter(Boolean);

  const origem = { lat: vendedor.origemLat, lng: vendedor.origemLng };
  const stops = clientes.map((c) => ({ lat: c.lat, lng: c.lng }));

  const resultado = await optimizeRoute(origem, stops);

  const paradas = resultado.order.map((stopIdx, posicao) => ({
    posicao: posicao + 1,
    cliente: clientes[stopIdx],
  }));

  res.json({
    vendedor,
    dia,
    origem,
    paradas,
    geometryLatLng: resultado.geometryLatLng,
    distanciaKm: resultado.distanceKm,
    duracaoMin: resultado.durationMin,
    fonte: resultado.source, // 'osrm' (ruas reais) ou 'haversine' (linha reta, fallback)
    steps: resultado.steps || [], // instrucoes de manobra turn-by-turn (so quando fonte === 'osrm')
  });
});

// ---------------------------------------------------------------------
// API: geocodificacao avulsa (usada pelas telas de cadastro para pre-visualizar)
// ---------------------------------------------------------------------
app.post('/api/geocode', async (req, res) => {
  try {
    const geo = await geocode(req.body.endereco);
    res.json(geo);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------
// API: snapshot de localizacoes atuais (para o painel do gestor no load)
// ---------------------------------------------------------------------
app.get('/api/localizacoes', (req, res) => {
  res.json(localizacoes);
});

app.get('/api/dias', (req, res) => res.json(DIAS));

// ---------------------------------------------------------------------
// Socket.io: rastreamento em tempo real
// ---------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('vendedor:location', (payload) => {
    if (!payload || !payload.vendedorId) return;
    const entry = {
      lat: payload.lat,
      lng: payload.lng,
      updatedAt: Date.now(),
      tracking: payload.tracking || 'gps',
      dia: payload.dia || null,
    };
    localizacoes[payload.vendedorId] = entry;
    io.emit('gestor:location-update', { vendedorId: payload.vendedorId, ...entry });
  });

  socket.on('vendedor:offline', (payload) => {
    if (!payload || !payload.vendedorId) return;
    delete localizacoes[payload.vendedorId];
    io.emit('gestor:vendedor-offline', { vendedorId: payload.vendedorId });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const ips = Object.values(nets)
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

  console.log(`\nVendRoute prototype rodando na porta ${PORT}`);
  console.log(`  Local:  http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Rede:   http://${ip}:${PORT}  (use no celular, mesma Wi-Fi)`));
  console.log('');
});

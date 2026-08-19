// Geocodificacao de enderecos usando a API publica do Nominatim (OpenStreetMap).
// Resultados sao cacheados no db.json para nao bater no rate limit (1 req/s)
// e para deixar o app rapido depois do primeiro cadastro.
const db = require('./db');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'VendRoute-Prototype/0.1 (uso interno de validacao de produto)';

function normalize(address) {
    return String(address || '').trim().toLowerCase();
}

async function geocode(address) {
    const key = normalize(address);
    if (!key) throw new Error('Endereco vazio.');

  const data = db.load();
    if (data.geocodeCache[key]) {
          return data.geocodeCache[key];
    }

  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;

  let resp;
    try {
          resp = await fetch(url, {
                  headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          });
    } catch (err) {
          throw new Error(`Nao foi possivel geocodificar (sem acesso a internet no ambiente?): ${err.message}`);
    }

  if (!resp.ok) {
        throw new Error(`Servico de geocodificacao retornou status ${resp.status}`);
  }

  const results = await resp.json();
    if (!Array.isArray(results) || results.length === 0) {
          throw new Error(`Endereco nao encontrado: "${address}". Tente incluir cidade e estado.`);
    }

  const best = results[0];
    const coords = { lat: parseFloat(best.lat), lng: parseFloat(best.lon), displayName: best.display_name };

  data.geocodeCache[key] = coords;
    db.save(data);

  return coords;
}

module.exports = { geocode, normalize };

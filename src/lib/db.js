// Camada de dados simples baseada em arquivo JSON.
// Suficiente para um protótipo/MVP; numa versão de produção isso viraria
// Postgres/Mongo etc.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'db.json');

const EMPTY_DB = {
    vendedores: [],
    clientes: [],
    visitas: [], // { id, vendedorId, clienteId, dia }
    geocodeCache: {},
};

function load() {
    if (!fs.existsSync(DB_PATH)) {
          save(EMPTY_DB);
          return structuredClone(EMPTY_DB);
    }
    try {
          const raw = fs.readFileSync(DB_PATH, 'utf-8');
          const parsed = JSON.parse(raw);
          return { ...structuredClone(EMPTY_DB), ...parsed };
    } catch (err) {
          console.error('Erro lendo db.json, recriando arquivo vazio:', err.message);
          save(EMPTY_DB);
          return structuredClone(EMPTY_DB);
    }
}

function save(data) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { load, save, DB_PATH };

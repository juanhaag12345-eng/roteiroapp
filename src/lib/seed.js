// Popula dados de demonstracao (vendedores, clientes e a agenda semanal de
// visitas) com coordenadas ja conhecidas, para o prototipo funcionar mesmo
// sem depender do servico de geocodificacao externo no primeiro boot.
const crypto = require('crypto');
const db = require('./db');

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex'];

const VENDEDORES = [
  {
        nome: 'Carla Mendes',
        email: 'carla.mendes@exemplo.com',
        cor: '#e63946',
        origemEndereco: 'Av. Paulista, 1000, Sao Paulo - SP',
        origemLat: -23.5615,
        origemLng: -46.6558,
  },
  {
        nome: 'Rafael Souza',
        email: 'rafael.souza@exemplo.com',
        cor: '#2a9d8f',
        origemEndereco: 'Av. Santo Amaro, 1200, Sao Paulo - SP',
        origemLat: -23.5943,
        origemLng: -46.6664,
  },
  {
        nome: 'Beatriz Lima',
        email: 'beatriz.lima@exemplo.com',
        cor: '#f4a261',
        origemEndereco: 'Praca da Se, Sao Paulo - SP',
        origemLat: -23.5505,
        origemLng: -46.6333,
  },
  ];

const CLIENTES = [
  { nome: 'Mercado Bom Preco', endereco: 'Rua Augusta, 500, Sao Paulo - SP', lat: -23.5555, lng: -46.6605 },
  { nome: 'Farmacia Vida', endereco: 'Rua Oscar Freire, 379, Sao Paulo - SP', lat: -23.5629, lng: -46.6708 },
  { nome: 'Padaria Pao Dourado', endereco: 'Av. Reboucas, 3000, Sao Paulo - SP', lat: -23.5738, lng: -46.6866 },
  { nome: 'Loja Estilo Casa', endereco: 'Av. Brigadeiro Faria Lima, 1500, Sao Paulo - SP', lat: -23.5745, lng: -46.6858 },
  { nome: 'Restaurante Sabor Caseiro', endereco: 'Av. Ibirapuera, 3000, Sao Paulo - SP', lat: -23.5975, lng: -46.6577 },
  { nome: 'Papelaria Central', endereco: 'Rua Vergueiro, 1000, Sao Paulo - SP', lat: -23.5698, lng: -46.6388 },
  { nome: 'Mini Mercado Ponte', endereco: 'Av. Nove de Julho, 3000, Sao Paulo - SP', lat: -23.5677, lng: -46.6553 },
  { nome: 'Otica Enxergar Bem', endereco: 'Shopping Morumbi, Av. Roque Petroni Jr., Sao Paulo - SP', lat: -23.6217, lng: -46.6989 },
  { nome: 'Pet Shop Amigo Fiel', endereco: 'Parque Ibirapuera, Sao Paulo - SP', lat: -23.5874, lng: -46.6576 },
  { nome: 'Loja Tech Point', endereco: 'Praca da Se, 100, Sao Paulo - SP', lat: -23.5501, lng: -46.6339 },
  { nome: 'Distribuidora Nova Era', endereco: 'Av. Paulista, 2000, Sao Paulo - SP', lat: -23.5605, lng: -46.6553 },
  { nome: 'Salao Beleza Total', endereco: 'Rua da Consolacao, 3000, Sao Paulo - SP', lat: -23.5556, lng: -46.6627 },
  ];

function id() {
    return crypto.randomUUID();
}

function seedIfEmpty() {
    const data = db.load();
    if (data.vendedores.length > 0 || data.clientes.length > 0) {
          return { seeded: false, data };
    }

  const vendedores = VENDEDORES.map((v) => ({ id: id(), ...v }));
    const clientes = CLIENTES.map((c) => ({ id: id(), ...c }));
    const visitas = [];

  // Cada vendedor visita ~3 clientes por dia util, revezando pelo catalogo
  // de clientes para gerar uma agenda semanal plausivel.
  vendedores.forEach((vend, vIdx) => {
        DIAS.forEach((dia, dIdx) => {
                const stopsPorDia = 3;
                for (let s = 0; s < stopsPorDia; s++) {
                          const clienteIdx = (vIdx * 4 + dIdx * stopsPorDia + s) % clientes.length;
                          visitas.push({ id: id(), vendedorId: vend.id, clienteId: clientes[clienteIdx].id, dia });
                }
        });
  });

  const next = { ...data, vendedores, clientes, visitas };
    db.save(next);
    return { seeded: true, data: next };
}

module.exports = { seedIfEmpty, DIAS };

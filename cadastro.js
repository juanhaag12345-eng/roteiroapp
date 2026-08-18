const DIA_LABELS = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};

let vendedores = [];
let clientes = [];
let visitas = [];

async function carregarTudo() {
  const [rv, rc, rvi] = await Promise.all([
    fetch('/api/vendedores'), fetch('/api/clientes'), fetch('/api/visitas'),
  ]);
  vendedores = await rv.json();
  clientes = await rc.json();
  visitas = await rvi.json();
  renderTudo();
}

function renderTudo() {
  document.getElementById('vsVendedor').innerHTML = vendedores.map((v) => `<option value="${v.id}">${v.nome}</option>`).join('');
  document.getElementById('vsCliente').innerHTML = clientes.map((c) => `<option value="${c.id}">${c.nome}</option>`).join('');

  document.querySelector('#tblVendedores tbody').innerHTML = vendedores
    .map((v) => `<tr><td><span class="dot" style="display:inline-block;background:${v.cor}"></span> ${v.nome}</td><td class="small">${v.origemEndereco}</td><td><button class="secundario" data-del-vendedor="${v.id}">remover</button></td></tr>`)
    .join('');

  document.querySelector('#tblClientes tbody').innerHTML = clientes
    .map((c) => `<tr><td>${c.nome}</td><td class="small">${c.endereco}</td><td><button class="secundario" data-del-cliente="${c.id}">remover</button></td></tr>`)
    .join('');

  document.querySelector('#tblVisitas tbody').innerHTML = visitas
    .map((vi) => {
      const vend = vendedores.find((v) => v.id === vi.vendedorId);
      const cli = clientes.find((c) => c.id === vi.clienteId);
      return `<tr><td>${vend ? vend.nome : '—'}</td><td>${cli ? cli.nome : '—'}</td><td>${DIA_LABELS[vi.dia]}</td><td><button class="secundario" data-del-visita="${vi.id}">remover</button></td></tr>`;
    })
    .join('');

  document.querySelectorAll('[data-del-vendedor]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/vendedores/${b.dataset.delVendedor}`, { method: 'DELETE' });
    await carregarTudo();
  }));
  document.querySelectorAll('[data-del-cliente]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/clientes/${b.dataset.delCliente}`, { method: 'DELETE' });
    await carregarTudo();
  }));
  document.querySelectorAll('[data-del-visita]').forEach((b) => b.addEventListener('click', async () => {
    await fetch(`/api/visitas/${b.dataset.delVisita}`, { method: 'DELETE' });
    await carregarTudo();
  }));
}

document.getElementById('formVendedor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msgVendedor');
  msg.innerHTML = '<p class="small">Geocodificando endereço…</p>';
  const body = {
    nome: document.getElementById('vNome').value,
    email: document.getElementById('vEmail').value,
    cor: document.getElementById('vCor').value,
    origemEndereco: document.getElementById('vOrigem').value,
  };
  const resp = await fetch('/api/vendedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) { msg.innerHTML = `<div class="erro">${data.error}</div>`; return; }
  msg.innerHTML = '<div class="aviso" style="background:#d8f3dc;color:#1b4332">Vendedor cadastrado!</div>';
  e.target.reset();
  document.getElementById('vCor').value = '#457b9d';
  await carregarTudo();
});

document.getElementById('formCliente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msgCliente');
  msg.innerHTML = '<p class="small">Geocodificando endereço…</p>';
  const body = {
    nome: document.getElementById('cNome').value,
    endereco: document.getElementById('cEndereco').value,
  };
  const resp = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) { msg.innerHTML = `<div class="erro">${data.error}</div>`; return; }
  msg.innerHTML = '<div class="aviso" style="background:#d8f3dc;color:#1b4332">Cliente cadastrado!</div>';
  e.target.reset();
  await carregarTudo();
});

document.getElementById('formVisita').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('msgVisita');
  const body = {
    vendedorId: document.getElementById('vsVendedor').value,
    clienteId: document.getElementById('vsCliente').value,
    dia: document.getElementById('vsDia').value,
  };
  if (!body.vendedorId || !body.clienteId) {
    msg.innerHTML = '<div class="erro">Cadastre ao menos um vendedor e um cliente primeiro.</div>';
    return;
  }
  const resp = await fetch('/api/visitas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) { msg.innerHTML = `<div class="erro">${data.error}</div>`; return; }
  msg.innerHTML = '';
  await carregarTudo();
});

carregarTudo();

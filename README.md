# VendRoute — Protótipo

Protótipo funcional para validar a ideia de um app de **roteirização de vendedores +
rastreamento em tempo real**.

## O que já funciona neste protótipo

- **Cadastro** (`/cadastro.html`): vendedores (com endereço-base geocodificado
  automaticamente), clientes (endereço geocodificado automaticamente) e a agenda
  semanal de visitas (qual vendedor visita qual cliente em qual dia).
- **Tela do vendedor** (`/vendedor.html`): escolhe o dia, o app calcula a **rota
  otimizada** (menor percurso) usando o serviço público OSRM (rota real nas ruas);
  se o serviço estiver indisponível, cai automaticamente para um cálculo local
  (vizinho-mais-próximo + 2-opt). Também permite **iniciar o rastreamento**
  (GPS real do celular via navegador, ou uma simulação de movimento ao longo
  da rota — útil pra demonstrar sem sair de casa).
- **Painel do gestor** (`/gestor.html`): mapa com a localização de todos os
  vendedores em tempo real (via WebSocket), lista de status (em rota /
  offline) e a opção de sobrepor a rota planejada de qualquer vendedor.

## Como rodar

Pré-requisito: [Node.js](https://nodejs.org) 18 ou superior instalado.

```bash
npm install
npm start
```

O terminal vai mostrar dois endereços:

```
Local:  http://localhost:3000
Rede:   http://SEU-IP:3000
```

- No **computador**, abra `http://localhost:3000` → painel do gestor.
- No **celular** (conectado na mesma rede Wi-Fi do computador), abra o
  endereço "Rede" → tela do vendedor. Selecione um vendedor, trace a rota,
  toque em "Iniciar rastreamento" com GPS real e veja o ponto se mover ao
  vivo no mapa do gestor, no computador.

Na primeira execução o app já vem com dados de demonstração (3 vendedores,
12 clientes e uma agenda semanal completa em São Paulo) para você testar sem
precisar cadastrar nada.

## Publicar com um link público (opcional)

Esse protótipo roda em qualquer serviço Node (Railway, Render, Fly.io etc.).
O caminho mais rápido com Railway, sem precisar do GitHub:

```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway domain
```

## Limitações conhecidas (é um protótipo, não produto final)

- **Banco de dados**: usa um arquivo JSON local (`data/db.json`). Ótimo para
  validar a ideia; um produto real precisaria de um banco de verdade
  (Postgres, por exemplo) e autenticação de usuários.
- **Rastreamento**: funciona enquanto a aba do navegador do vendedor estiver
  aberta. Um app real (nativo ou PWA instalado) manteria o rastreamento
  funcionando em segundo plano.
- **Geocodificação e rotas**: usa serviços públicos gratuitos (Nominatim/OSRM),
  que têm limite de uso. Em produção, vale considerar Google Maps/Mapbox
  (pagos, mais robustos) dependendo do volume.
- **Sem login/permissões**: qualquer pessoa pode "ser" qualquer vendedor
  nesta versão — é só pra validar o conceito.

## Ideias para os próximos passos

1. Autenticação (vendedor só vê a própria rota; gestor vê todos).
2. App mobile nativo/PWA instalável, com rastreamento em segundo plano e
   notificações (ex.: "chegou perto do cliente X").
3. Histórico de rotas percorridas vs. planejadas (indicador de eficiência).
4. Marcar visita como concluída, com foto/assinatura do cliente.
5. Reotimizar a rota automaticamente se o vendedor sair da ordem prevista.
6. Multiempresa/multiequipe, com hierarquia de gestores.

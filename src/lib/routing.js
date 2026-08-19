// Otimizacao de rota (problema do caixeiro-viajante simplificado).
//
// Estrategia:
//  1) Tenta usar o servico publico OSRM (Trip API) para obter a ordem otima
//     considerando a malha viaria real + o desenho da rota nas ruas.
//  2) Se o OSRM nao estiver acessivel (rate limit, rede, etc.), cai para um
//     heuristico local: vizinho-mais-proximo + melhoria 2-opt usando
//     distancia em linha reta (haversine). Sempre funciona, mesmo offline.

const OSRM_URL = 'https://router.project-osrm.org';

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function buildDistanceMatrix(points) {
    const n = points.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
                  const d = haversineKm(points[i], points[j]);
                  matrix[i][j] = d;
                  matrix[j][i] = d;
          }
    }
    return matrix;
}

// origin + stops -> ordem (indices de stops) por vizinho-mais-proximo
function nearestNeighborOrder(origin, stops) {
    const remaining = stops.map((_, i) => i);
    const order = [];
    let current = origin;
    while (remaining.length) {
          let bestIdx = 0;
          let bestDist = Infinity;
          for (let k = 0; k < remaining.length; k++) {
                  const d = haversineKm(current, stops[remaining[k]]);
                  if (d < bestDist) {
                            bestDist = d;
                            bestIdx = k;
                  }
          }
          const chosen = remaining.splice(bestIdx, 1)[0];
          order.push(chosen);
          current = stops[chosen];
    }
    return order;
}

function routeLengthKm(origin, stops, order) {
                        let total = 0;
    let prev = origin;
    for (const idx of order) {
          total += haversineKm(prev, stops[idx]);
          prev = stops[idx];
    }
    return total;
}

// Melhoria local 2-opt sobre a ordem dos stops (origem fixa como inicio)
function twoOptImprove(origin, stops, order) {
    let improved = true;
    let best = order.slice();
    let bestLen = routeLengthKm(origin, stops, best);

  while (improved) {
        improved = false;
        for (let i = 0; i < best.length - 1; i++) {
                for (let j = i + 1; j < best.length; j++) {
                          const candidate = best.slice(0, i).concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
                          const len = routeLengthKm(origin, stops, candidate);
                          if (len + 1e-9 < bestLen) {
                                      best = candidate;
                                      bestLen = len;
                                      improved = true;
                          }
                }
        }
  }
    return { order: best, distanceKm: bestLen };
}

function haversineFallback(origin, stops) {
    const nn = nearestNeighborOrder(origin, stops);
    const { order, distanceKm } = twoOptImprove(origin, stops, nn);
    const geometryLatLng = [origin, ...order.map((i) => stops[i])];
    return {
          order,
          geometryLatLng,
          distanceKm: Math.round(distanceKm * 10) / 10,
          durationMin: Math.round((distanceKm / 30) * 60), // estimativa a 30km/h medio urbano
          source: 'haversine',
    };
}

async function osrmTrip(origin, stops) {
    const coordsList = [origin, ...stops];
    const coordsStr = coordsList.map((p) => `${p.lng},${p.lat}`).join(';');
    const url =
          `${OSRM_URL}/trip/v1/driving/${coordsStr}` +
          `?source=first&roundtrip=false&overview=full&geometries=geojson`;

  const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OSRM status ${resp.status}`);
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.trips || !data.trips.length) {
          throw new Error(`OSRM nao retornou rota valida (${data.code})`);
    }

  // data.waypoints esta na MESMA ordem dos pontos de entrada (origin + stops),
  // cada um com waypoint_index = posicao dele na rota otimizada.
  const waypoints = data.waypoints;
    // indice 0 e a origem; os demais (1..n) correspondem a stops[0..n-1]
  const stopWaypoints = waypoints.slice(1).map((wp, stopIdx) => ({ stopIdx, tripPos: wp.waypoint_index }));
    stopWaypoints.sort((a, b) => a.tripPos - b.tripPos);
    const order = stopWaypoints.map((w) => w.stopIdx);

  const trip = data.trips[0];
    const geometryLatLng = trip.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

  return {
        order,
        geometryLatLng,
        distanceKm: Math.round((trip.distance / 1000) * 10) / 10,
        durationMin: Math.round(trip.duration / 60),
        source: 'osrm',
  };
}

async function optimizeRoute(origin, stops) {
    if (!stops.length) {
          return { order: [], geometryLatLng: [origin], distanceKm: 0, durationMin: 0, source: 'none' };
    }
    try {
          return await osrmTrip(origin, stops);
    } catch (err) {
          console.warn('OSRM indisponivel, usando heuristico local (haversine):', err.message);
          return haversineFallback(origin, stops);
    }
}

module.exports = { haversineKm, buildDistanceMatrix, optimizeRoute, haversineFallback };

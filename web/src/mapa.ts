// Mapa estilo radar: projeção equiretangular simples, sem assets externos.

import { svg } from "./dom";
import type { Caso } from "./tipos";

const W = 240;
const H = 170;
const LON = [-100, 20] as const;
const LAT = [-42, 48] as const;

const x = (lon: number): number => ((lon - LON[0]) / (LON[1] - LON[0])) * W;
const y = (lat: number): number => ((LAT[1] - lat) / (LAT[1] - LAT[0])) * H;

// Contornos grosseiros (lon, lat), de propósito "low-poly" — só para orientação.
const TERRAS: [number, number][][] = [
  [[-80, 9], [-72, 12], [-63, 10.5], [-60, 8], [-52, 4], [-50, 0], [-44, -2.5], [-35, -5],
    [-35, -9], [-39, -13], [-40, -20], [-43, -23], [-48, -26], [-49, -29], [-53, -34],
    [-58, -34.5], [-57, -38], [-62, -39], [-65, -42], [-68, -50], [-74, -50], [-73, -40],
    [-71.5, -30], [-70.5, -18], [-76, -14], [-81, -6], [-80, -2], [-80, 1], [-77.5, 7]],
  [[-100, 48], [-67, 48], [-67, 45], [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 27],
    [-80.5, 25], [-82, 26.5], [-83, 29.5], [-89, 30], [-94, 29.5], [-97, 26], [-97.5, 22],
    [-96, 19], [-91, 19], [-90, 21], [-87, 21.5], [-88, 16], [-84, 15.5], [-83.5, 11],
    [-81.5, 9], [-79.5, 9.5], [-77.5, 8], [-80, 7.5], [-85.5, 10], [-87.5, 13], [-92, 14.5],
    [-95, 16], [-100, 17]],
  [[-6, 36], [-1, 35.5], [10, 37], [11, 33], [20, 31], [20, -35], [18, -34.5], [15, -27],
    [12, -17], [13, -5], [10, 0], [9, 4], [0, 5], [-8, 4.5], [-12, 7], [-17, 15], [-17, 21],
    [-13, 27.5], [-10, 30]],
  [[-9, 37], [-9, 43], [-2, 43.5], [-1.5, 46], [-4.5, 48], [20, 48], [20, 40], [18, 40],
    [16, 38], [15.5, 38.5], [13, 41], [12, 42], [10, 44], [7, 43.5], [3, 43], [3, 42], [0, 39],
    [-2, 36.8], [-5.5, 36], [-7, 37]],
];

export function mapa(caso: Caso, trilha: string[], atual: string): SVGElement {
  const raiz = svg("svg", {
    viewBox: `0 0 ${W} ${H}`, class: "mapa", role: "img",
    "aria-label": "Mapa com as cidades visitadas",
  });
  for (const t of TERRAS) {
    raiz.appendChild(svg("polygon", {
      class: "terra", points: t.map(([lon, lat]) => `${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join(" "),
    }));
  }
  const grade = svg("g", { class: "grade" });
  for (let lon = -90; lon <= 15; lon += 15) {
    grade.appendChild(svg("line", { x1: x(lon), y1: 0, x2: x(lon), y2: H }));
  }
  for (let lat = -30; lat <= 45; lat += 15) {
    grade.appendChild(svg("line", { x1: 0, y1: y(lat), x2: W, y2: y(lat) }));
  }
  grade.appendChild(svg("line", { x1: 0, y1: y(0), x2: W, y2: y(0), class: "equador" }));
  raiz.appendChild(grade);

  const pts = trilha.map((id) => caso.cidades[id]!).map((c) => `${x(c.lon)},${y(c.lat)}`);
  if (pts.length > 1) raiz.appendChild(svg("polyline", { points: pts.join(" "), class: "trilha" }));

  const visitadas = new Set(trilha);
  for (const [id, c] of Object.entries(caso.cidades)) {
    const cls = id === atual ? "cidade atual" : visitadas.has(id) ? "cidade visitada" : "cidade";
    raiz.appendChild(svg("circle", { cx: x(c.lon), cy: y(c.lat), r: id === atual ? 3.5 : 2, class: cls },
      svg("title", {}, `${c.nome} (${c.pais})`)));
  }
  return raiz;
}

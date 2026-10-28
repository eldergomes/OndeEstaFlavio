// Espelha backend/rota/models.py (Caso, versão 1). Validado em tempo de execução por validar.ts.

export type Status = "confirmado" | "contestado" | "desmentido";
export type Modo = "imprensa" | "ficcao";
export type Fim = "vitoria" | "dossie_errado" | "sem_dossie" | "prazo";

export interface Regras {
  min_investigar: number;
  min_checar: number;
  min_dossie: number;
  min_embarque: number;
  velocidade_kmh: number;
  dormir_de: number;
  dormir_ate: number;
}

export interface Local {
  id: string;
  nome: string;
}

export interface Cidade {
  nome: string;
  pais: string;
  lat: number;
  lon: number;
  descricao: string;
  locais: Local[];
}

export interface Fonte {
  veiculo: string;
  titulo: string;
  url: string;
  publicado: string;
}

export interface Fato {
  texto: string;
  status: Status;
  nota: string;
  fontes: Fonte[];
}

export interface Pista {
  local: string;
  texto: string;
  fato: string | null;
}

export interface Desfecho {
  vitoria: string;
  dossie_errado: string;
  sem_dossie: string;
  prazo: string;
}

export interface Caso {
  versao: 1;
  id: string;
  modo: Modo;
  seed: number;
  titulo: string;
  briefing: string;
  inicio: string;
  prazo_horas: number;
  regras: Regras;
  rota: string[];
  destino_pais: string;
  alvo_local: string;
  paises: string[];
  cidades: Record<string, Cidade>;
  destinos: Record<string, string[]>;
  pistas: Record<string, Pista[]>;
  fatos: Record<string, Fato>;
  perto: string[];
  nada: string[];
  desfecho: Desfecho;
}

export interface Estado {
  minutos: number;
  pos: number;
  cidade: string;
  investigados: string[];
  revelados: string[];
  checados: string[];
  dossie: string | null;
  fim: Fim | null;
  pontos: number;
}

export type TipoEvento = "pista" | "checagem" | "viagem" | "dossie" | "sono" | "fim";

export interface Evento {
  tipo: TipoEvento;
  texto: string;
  ref: string | null;
}

export interface IndiceCaso {
  id: string;
  modo: Modo;
  seed: number;
}

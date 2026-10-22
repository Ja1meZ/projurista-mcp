import { Ferramenta } from "../tipos";
import { FERRAMENTAS_LEITURA } from "./leitura";
import { FERRAMENTAS_BUSCA } from "./busca";
import { FERRAMENTAS_ESCRITA } from "./escrita";

export const TODAS_AS_FERRAMENTAS: Ferramenta[] = [...FERRAMENTAS_LEITURA, ...FERRAMENTAS_BUSCA, ...FERRAMENTAS_ESCRITA];

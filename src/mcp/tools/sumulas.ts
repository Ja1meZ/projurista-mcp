import type { Ferramenta } from "../tipos";
import { FERRAMENTAS_SUMULAS_NUCLEO } from "../../sumulas/ferramentas";

/** Ferramentas de súmulas (base embutida, sem rede), anunciadas enquanto a opção estiver ligada. */
export const FERRAMENTAS_SUMULAS: Ferramenta[] = FERRAMENTAS_SUMULAS_NUCLEO.map((f) => ({
	...f,
	disponivel: (contexto) => contexto.configuracoes.ferramentasSumulas !== false,
}));

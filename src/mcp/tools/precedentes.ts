import type { Ferramenta } from "../tipos";
import { FERRAMENTAS_PRECEDENTES_NUCLEO } from "../../precedentes/ferramentas";

/** Ferramentas de precedentes qualificados do STJ (base embutida, sem rede), anunciadas enquanto a opção estiver ligada. */
export const FERRAMENTAS_PRECEDENTES: Ferramenta[] = FERRAMENTAS_PRECEDENTES_NUCLEO.map((f) => ({
	...f,
	disponivel: (contexto) => contexto.configuracoes.ferramentasPrecedentes !== false,
}));

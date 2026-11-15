#!/usr/bin/env python3
"""Gera dados/precedentes-stf.json a partir da planilha de temas de repercussão geral do STF.

Fonte: https://transparencia.stf.jus.br/extensions/dados_abertos/dados_abertos.html
       (Repercussão Geral > Temas > xlsx)

    python3 scripts/exportar-base-precedentes-stf.py <temas.xlsx> --data-fonte AAAA-MM-DD [--complementos <pasta>]

Só biblioteca padrão e sem rede. O título, a descrição e a tese são copiados como estão na planilha
(apenas os espaços das pontas são retirados). A classificação da situação e os alertas são campos
à parte, derivados por regra.

A planilha corta a tese em 4.000 caracteres. Para os temas nessa situação, --complementos aponta
uma pasta com a página do tema no portal do STF, já baixada, com o nome tema-<número>.html
(https://portal.stf.jus.br/jurisprudenciaRepercussao/verAndamentoProcesso.asp?incidente=…&numeroProcesso=…&classeProcesso=…&numeroTema=…).
A tese é tirada do bloco "Tese:" da página e só é aceita se começar com o texto da planilha.
Sem a página, a tese fica como veio, marcada TESE_TRUNCADA_NA_FONTE. O portal também corta, em
8.000 caracteres: tese que chega a esse tamanho continua marcada como truncada.

Sai com código 2, sem gravar, se a planilha não tiver a estrutura esperada.
"""
import argparse
import collections
import datetime
import hashlib
import html
import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))  # com "python3 -I" a pasta do script não entra no caminho
from _planilha import erro, gravar_base, ler_planilha, literal  # noqa: E402

OBRIGATORIAS = [
    "Status Tema", "Número tema", "Título tema", "Descrição tema", "Tese", "Processo paradigma", "Relator atual",
    "Situação repercussão geral", "Situação Processo Paradigma", "Link Processo", "Data admissibilidade RG",
    "Data julgamento tema", "Ramos do Direito", "Assunto", "Situação Suspensão Nacional",
    "Data Determinação Suspensão Nacional", "Data Revogação Suspensão Nacional",
    "Decisão admissibilidade tema", "Decisão julgamento tema",
]
# A planilha corta a tese neste tamanho; a partir de LIMIAR a tese é tratada como possivelmente cortada.
LIMITE_PLANILHA = 4000
LIMIAR_TRUNCADA = 3990
# A página do portal também corta a tese, em 8.000 caracteres.
LIMIAR_TRUNCADA_PORTAL = 7990
VAZIOS = {"", "-", "**Cancelado**", "NÃO INFORMADO"}

RE_MODULACAO = re.compile(r"modula[çc][ãaõo]|modular\s+os\s+efeitos|modulad[oa]s?\s+os\s+efeitos", re.I)
RE_TESE_PORTAL = re.compile(r"<dt>\s*Tese:\s*</dt>\s*<dd>(.*?)</dd>", re.S | re.I)


def texto(valor):
    t = literal(valor)
    return "" if t in VAZIOS else t


def data(valor):
    """Número serial do Excel (com ou sem fração de dia) -> AAAA-MM-DD."""
    t = literal(valor)
    if t in VAZIOS:
        return ""
    try:
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(t)))).isoformat()
    except ValueError:
        return t[:10] if re.match(r"\d{4}-\d{2}-\d{2}", t) else ""


def enxuto(valor):
    """Campos auxiliares (decisões): tira os recuos e as linhas em branco repetidas da planilha."""
    linhas = [l.strip() for l in texto(valor).splitlines()]
    return "\n".join(l for l in linhas if l)


def sem_espacos(s):
    return re.sub(r"\s+", "", s)


def tese_do_portal(arquivo):
    bruto = arquivo.read_bytes()
    try:
        pagina = bruto.decode("utf-8")
    except UnicodeDecodeError:
        pagina = bruto.decode("latin-1")
    m = RE_TESE_PORTAL.search(pagina)
    if not m:
        return None
    t = re.sub(r"<br\s*/?>", "\n", m.group(1), flags=re.I)
    if re.search(r"<[a-zA-Z/]", t):
        return None  # marcação inesperada dentro da tese: não arriscar
    return html.unescape(t).replace("\r\n", "\n").replace("\r", "\n").strip(" \t\n ")


def classificar(status, situacao_rg, situacao_paradigma, tem_tese):
    rg = situacao_rg.lower()
    if status.lower() == "cancelado" or "cancelado" in rg:
        return "cancelado"
    if rg.startswith("rg negada"):
        return "rg_negada"
    if rg.startswith("em análise") or "mérito pendente" in rg:
        return "afetado"
    if "mérito julgado" in rg or "reafirmação" in rg:
        # sem tese na planilha, o tema transitado fica com o alerta SEM_TESE_NA_FONTE e não é servido como tese
        return "transitado" if situacao_paradigma.lower() == "trânsito em julgado" else "tese_sem_transito"
    return None


def montar(linhas, complementos):
    if not linhas:
        erro("planilha vazia.")
    cabecalho = [(c or "").strip() for c in linhas[0]]
    faltam = [c for c in OBRIGATORIAS if c not in cabecalho]
    if faltam:
        erro(f"colunas ausentes na planilha: {faltam}\n  lido: {cabecalho}")
    pos = {nome: i for i, nome in enumerate(cabecalho)}
    registros, vistos, desconhecidas, completadas, truncadas = [], set(), collections.Counter(), [], []
    for n, bruta in enumerate(linhas[1:], start=2):
        cheia = list(bruta) + [None] * (len(cabecalho) - len(bruta))
        if not any(cheia):
            continue
        c = lambda nome: cheia[pos[nome]]  # noqa: E731
        try:
            numero = int(float(c("Número tema")))
        except (TypeError, ValueError):
            erro(f"linha {n}: número de tema inválido: {c('Número tema')!r}")
        if numero < 1 or numero in vistos:
            erro(f"linha {n}: tema repetido ou inválido: {numero}")
        vistos.add(numero)

        tese = texto(c("Tese"))
        alertas = []
        if len(tese) >= LIMIAR_TRUNCADA:
            pagina = complementos / f"tema-{numero}.html" if complementos else None
            integral = tese_do_portal(pagina) if pagina and pagina.exists() else None
            # a planilha pode cortar no meio de uma palavra: confere o começo, sem contar espaços
            if integral and len(integral) >= len(tese) and sem_espacos(integral).startswith(sem_espacos(tese)[:-3]):
                if len(integral) > len(tese):
                    alertas.append({"codigo": "TESE_COMPLETADA_PELO_PORTAL", "detalhe": f"a planilha traz {len(tese)} caracteres; o portal, {len(integral)}"})
                    completadas.append(numero)
                tese = integral
                if len(integral) >= LIMIAR_TRUNCADA_PORTAL:
                    alertas.append({"codigo": "TESE_TRUNCADA_NA_FONTE", "detalhe": f"o portal do STF também corta a tese, em {len(integral)} caracteres"})
                    truncadas.append(numero)
            else:
                alertas.append({"codigo": "TESE_TRUNCADA_NA_FONTE", "detalhe": f"cortada em {len(tese)} caracteres"})
                truncadas.append(numero)

        status = literal(c("Status Tema"))
        situacao_rg = literal(c("Situação repercussão geral"))
        situacao_paradigma = literal(c("Situação Processo Paradigma"))
        situacao = classificar(status, situacao_rg, situacao_paradigma, bool(tese))
        if situacao is None:
            desconhecidas[situacao_rg] += 1
            situacao = "outro"

        suspensao_bruta = texto(c("Situação Suspensão Nacional"))
        determinada, revogada = data(c("Data Determinação Suspensão Nacional")), data(c("Data Revogação Suspensão Nacional"))
        suspensao = ""
        if suspensao_bruta and suspensao_bruta != "Sem Suspensão Nacional":
            suspensao = suspensao_bruta + (f", determinada em {determinada}" if determinada else "") + (f", revogada em {revogada}" if revogada else "")

        decisao_julgamento = enxuto(c("Decisão julgamento tema"))
        decisao_admissibilidade = enxuto(c("Decisão admissibilidade tema"))
        if decisao_admissibilidade == decisao_julgamento:
            decisao_admissibilidade = ""

        if "¿" in tese:
            alertas.append({"codigo": "CARACTERES_CORROMPIDOS_NA_FONTE", "detalhe": f"{tese.count('¿')} ocorrência(s) de \"¿\" no lugar de espaço"})
        if not tese and situacao in ("transitado", "tese_sem_transito"):
            alertas.append({"codigo": "SEM_TESE_NA_FONTE"})
        if suspensao_bruta == "Suspensão Nacional Vigente":
            alertas.append({"codigo": "SUSPENSAO_NACIONAL_VIGENTE", "detalhe": determinada})
        if RE_MODULACAO.search(tese + "\n" + decisao_julgamento):
            alertas.append({"codigo": "MODULACAO_DE_EFEITOS"})

        paradigma = texto(c("Processo paradigma"))
        registros.append({
            "id": f"STF:RG:{numero}",
            "tribunal": "STF",
            "tipo": "RG",
            "numero": numero,
            "situacao": situacao,
            "situacao_original": f"{situacao_rg}; processo paradigma: {situacao_paradigma}",
            "data_situacao": data(c("Data julgamento tema")) or data(c("Data admissibilidade RG")),
            "orgao_julgador": "",
            "primeiro_relator": "",
            "relator_atual": texto(c("Relator atual")),
            "titulo": texto(c("Título tema")),
            "questao": texto(c("Descrição tema")),
            "tese": tese,
            "sha256_tese": hashlib.sha256(tese.encode("utf-8")).hexdigest() if tese else "",
            "anotacoes": "",
            "paradigmas": [paradigma] if paradigma else [],
            "link_processo": texto(c("Link Processo")),
            "ramo_direito": texto(c("Ramos do Direito")),
            "assunto": texto(c("Assunto")),
            "suspensao": suspensao,
            "decisao_julgamento": decisao_julgamento,
            "decisao_admissibilidade": decisao_admissibilidade,
            "alertas": alertas,
        })
    registros.sort(key=lambda r: r["numero"])
    return registros, desconhecidas, completadas, truncadas


def diferencas(anterior, registros):
    antes = {r["id"]: r for r in anterior.get("precedentes", [])}
    agora = {r["id"]: r for r in registros}
    novos = [i for i in agora if i not in antes]
    sumidos = [i for i in antes if i not in agora]
    situacao = [(i, antes[i]["situacao_original"], agora[i]["situacao_original"]) for i in agora if i in antes and antes[i]["situacao_original"] != agora[i]["situacao_original"]]
    tese = [i for i in agora if i in antes and antes[i]["tese"] != agora[i]["tese"]]
    linhas = [f"- Temas novos: {len(novos)}" + (": " + ", ".join(novos[:60]) if novos else ""),
              f"- Temas que saíram da planilha: {len(sumidos)}" + (": " + ", ".join(sumidos[:60]) if sumidos else ""),
              f"- Mudança de situação: {len(situacao)}"]
    linhas += [f"  - {i}: {a} → {b}" for i, a, b in situacao]
    linhas.append(f"- Tese alterada: {len(tese)}" + (": " + ", ".join(tese) if tese else ""))
    return linhas


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("planilha")
    ap.add_argument("--data-fonte", required=True, help="data em que a planilha foi baixada do STF (AAAA-MM-DD)")
    ap.add_argument("--complementos", help="pasta com as páginas do portal (tema-<número>.html) dos temas de tese cortada")
    ap.add_argument("--saida", default=str(pathlib.Path(__file__).resolve().parent.parent / "dados" / "precedentes-stf.json"))
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.data_fonte):
        erro("--data-fonte deve estar no formato AAAA-MM-DD.")
    planilha, saida = pathlib.Path(args.planilha), pathlib.Path(args.saida)
    complementos = pathlib.Path(args.complementos) if args.complementos else None

    registros, desconhecidas, completadas, truncadas = montar(ler_planilha(planilha), complementos)
    situacoes = collections.Counter(r["situacao"] for r in registros)
    base = {
        "versao_base": args.data_fonte.replace("-", "."),
        "gerado_em": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "aviso": "Base gerada por script a partir da planilha oficial de temas de repercussão geral do STF. Não edite à mão: regenere com scripts/exportar-base-precedentes-stf.py.",
        "fonte": {
            "orgao": "Supremo Tribunal Federal — Dados Abertos, Repercussão Geral (Temas)",
            "url": "https://transparencia.stf.jus.br/extensions/dados_abertos/dados_abertos.html",
            "data_fonte": args.data_fonte,
            "arquivo": planilha.name,
            "sha256_arquivo": hashlib.sha256(planilha.read_bytes()).hexdigest(),
            "teses_completadas_pelo_portal": completadas,
            "teses_truncadas": truncadas,
        },
        "cobertura": {"RG": {
            "de": registros[0]["numero"], "ate": registros[-1]["numero"], "total": len(registros),
            "com_tese": sum(1 for r in registros if r["tese"]), "situacao": dict(situacoes),
        }},
    }
    anterior = json.loads(saida.read_text(encoding="utf-8")) if saida.exists() else None
    gravar_base(saida, base, registros)

    faltantes = sorted(set(range(1, registros[-1]["numero"] + 1)) - {r["numero"] for r in registros})
    rel = [f"# Ingestão dos temas de repercussão geral do STF — fonte de {args.data_fonte}", "",
           f"- Planilha: `{planilha.name}` (sha256 `{base['fonte']['sha256_arquivo']}`)",
           f"- Temas: {len(registros)} ({registros[0]['numero']} a {registros[-1]['numero']}); com tese: {base['cobertura']['RG']['com_tese']}; lacunas na numeração: {faltantes or 'nenhuma'}",
           f"- Teses completadas pela página do portal: {completadas or 'nenhuma'}",
           f"- Teses que ficaram cortadas (sem página de complemento válida): {truncadas or 'nenhuma'}", "",
           "## Classe atribuída", ""]
    rel += [f"- {k}: {v}" for k, v in sorted(situacoes.items(), key=lambda x: -x[1])]
    rel += ["", "## Situações do STF e classe atribuída", ""]
    pares = collections.Counter((r["situacao_original"], r["situacao"]) for r in registros)
    rel += [f"- {o} → {s}: {n}" for (o, s), n in sorted(pares.items(), key=lambda x: (x[0][1], -x[1]))]
    if desconhecidas:
        rel += ["", "## ATENÇÃO — situações não mapeadas (classificadas como \"outro\")", ""] + [f"- {s!r}: {n}" for s, n in desconhecidas.items()]
    rel += ["", "## Alertas derivados", ""]
    rel += [f"- {k}: {v}" for k, v in collections.Counter(a["codigo"] for r in registros for a in r["alertas"]).most_common()]
    if anterior:
        rel += ["", f"## Diferenças contra a base anterior ({anterior.get('versao_base', '?')})", ""] + diferencas(anterior, registros)
    relatorio = saida.with_suffix(".relatorio.md")
    relatorio.write_text("\n".join(rel) + "\n", encoding="utf-8")

    print(f"{len(registros)} temas gravados em {saida} ({saida.stat().st_size / 1e6:.2f} MB)")
    print(f"Relatório: {relatorio}")
    if truncadas:
        print(f"ATENÇÃO: {len(truncadas)} tese(s) ficaram cortadas: {truncadas}")
    if desconhecidas:
        print(f"ATENÇÃO: {sum(desconhecidas.values())} tema(s) com situação não mapeada; veja o relatório.")


if __name__ == "__main__":
    main()

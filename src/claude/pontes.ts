/**
 * Textos das pontes stdio ⇄ TCP usadas pelo Claude Desktop.
 * Nenhuma depende de software instalado pelo usuário:
 *  - macOS: /bin/sh e /usr/bin/nc vêm com o sistema;
 *  - Windows: powershell.exe vem com o sistema;
 *  - .mcpb: o Claude Desktop traz o próprio Node.js.
 */

/** Script para /bin/sh -c no macOS. O token chega pela variável PROJURISTA_TOKEN. */
export function scriptShellMac(porta: number): string {
	const aviso = `Projurista MCP: o Obsidian não está aberto ou o servidor está desligado (porta ${porta}).`;
	return (
		`i=0; ` +
		`while ! /usr/bin/nc -z 127.0.0.1 ${porta} >/dev/null 2>&1; do ` +
		`i=$((i+1)); ` +
		`if [ "$i" -ge 30 ]; then echo "${aviso}" >&2; exit 1; fi; ` +
		`sleep 2; ` +
		`done; ` +
		`(printf '%s\\n' "PROJURISTA-TOKEN $PROJURISTA_TOKEN"; cat) | /usr/bin/nc 127.0.0.1 ${porta}`
	);
}

/** Conteúdo de ponte.ps1 (Windows PowerShell 5.1 ou superior). Gravado com BOM UTF-8. */
export const PONTE_POWERSHELL = `param(
    [int]$Porta = 27180,
    [string]$Token = $env:PROJURISTA_TOKEN
)
# Projurista MCP: ponte entre o stdio do Claude Desktop e o servidor TCP do plugin no Obsidian.
$ErrorActionPreference = 'Stop'
if (-not $Token) {
    [Console]::Error.WriteLine('Projurista MCP: token ausente (variável PROJURISTA_TOKEN).')
    exit 1
}

$cliente = $null
$inicio = Get-Date
while ($true) {
    try {
        $cliente = New-Object System.Net.Sockets.TcpClient
        $cliente.NoDelay = $true
        $cliente.Connect('127.0.0.1', $Porta)
        break
    } catch {
        if ($cliente) { $cliente.Close() }
        if (((Get-Date) - $inicio).TotalSeconds -gt 60) {
            [Console]::Error.WriteLine("Projurista MCP: o Obsidian não está aberto ou o servidor está desligado (porta $Porta).")
            exit 1
        }
        Start-Sleep -Seconds 2
    }
}

$fluxo = $cliente.GetStream()
$entrada = [Console]::OpenStandardInput()
$saida = [Console]::OpenStandardOutput()

$bytesToken = [System.Text.Encoding]::UTF8.GetBytes("PROJURISTA-TOKEN $Token\`n")
$fluxo.Write($bytesToken, 0, $bytesToken.Length)
$fluxo.Flush()

# Socket -> stdout em segundo plano.
$copia = $fluxo.CopyToAsync($saida)

# stdin -> socket no primeiro plano.
$buffer = New-Object byte[] 65536
try {
    while ($true) {
        $lidos = $entrada.Read($buffer, 0, $buffer.Length)
        if ($lidos -le 0) { break }
        $fluxo.Write($buffer, 0, $lidos)
        $fluxo.Flush()
    }
} catch {
}
try { $cliente.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch {}
try { [void]$copia.Wait(5000) } catch {}
try { $saida.Flush() } catch {}
$cliente.Close()
exit 0
`;

/** Conteúdo de ponte.js para o pacote .mcpb (Node.js embutido no Claude Desktop). Só módulos nativos. */
export const PONTE_NODE = `// Projurista MCP: ponte entre o stdio do Claude Desktop e o servidor TCP do plugin no Obsidian.
"use strict";
const net = require("net");

const porta = Number(process.env.PROJURISTA_PORTA || "27180");
const token = process.env.PROJURISTA_TOKEN || "";
if (!token) {
  process.stderr.write("Projurista MCP: token ausente (variável PROJURISTA_TOKEN).\\n");
  process.exit(1);
}

let tentativas = 0;
function conectar() {
  const socket = net.connect({ host: "127.0.0.1", port: porta });
  socket.setNoDelay(true);
  socket.once("connect", () => {
    socket.write("PROJURISTA-TOKEN " + token + "\\n");
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
    socket.on("close", () => process.exit(0));
    socket.on("error", () => process.exit(1));
  });
  socket.once("error", (erro) => {
    if (socket.connecting || erro.code === "ECONNREFUSED") {
      tentativas += 1;
      if (tentativas <= 30) {
        setTimeout(conectar, 2000);
        return;
      }
      process.stderr.write("Projurista MCP: o Obsidian não está aberto ou o servidor está desligado (porta " + porta + ").\\n");
      process.exit(1);
    }
  });
}
// Quando o Claude fecha o stdin, o pipe encerra o lado de escrita do socket;
// o servidor responde fechando a conexão e o processo termina no evento "close".
conectar();
`;

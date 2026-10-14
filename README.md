# REA — Reverse Engineer Anything

Este repositorio está dedicado a usar **[REA](https://github.com/morluto/rea)**, un servidor
MCP que conecta un agente de IA (Claude Code, Codex, Cursor, Gemini CLI…) con herramientas de
ingeniería inversa para analizar cómo funciona un programa: binarios nativos, apps de
Electron/JavaScript, ensamblados .NET, APKs de Android, webs, firmware, capturas de red y el
comportamiento de procesos en ejecución.

> **Uso lícito.** REA es solo para **software que posees o estás autorizado a examinar**:
> investigación legal, educación, interoperabilidad y preservación. No sirve para saltarse
> licencias/DRM ni para piratear software ajeno. Las herramientas comerciales (IDA Pro, Hopper,
> JEB) hay que obtenerlas legalmente.

REA **no se despliega como una web**: se instala en tu ordenador y se enchufa a tu agente.

---

## Requisitos

- **Node.js 22.x, 24.x o 26+** y **npm** → https://nodejs.org (elige la versión LTS).
- Un agente compatible instalado (por ejemplo **Claude Code**).
- Según lo que quieras analizar, herramientas extra (opcionales):
  - Binarios nativos: **Ghidra**, **Hopper** o **IDA**.
  - Android (APK): **JADX**.
  - Firmware: **Binwalk** o **Unblob**.

## Instalación (recomendada)

Esto registra el servidor MCP de REA en los agentes que tengas y añade sus instrucciones de
trabajo (hace copia de seguridad de tu configuración previa):

```bash
npx rea-agents setup
```

Opcional — instalar el comando global `rea`:

```bash
npm install --global rea-agents
```

Tras `setup`, **reinicia tu agente** para que cargue el servidor MCP.

## Cómo se usa

Con REA activo, le pides a tu agente que investigue algo que **tú tengas**. Ejemplos:

- "Analiza este binario y explícame cómo valida la licencia *(de un programa mío)*."
- "Mira cómo funciona la búsqueda en esta app de notas y escríbeme algo parecido."
- "Revisa este APK mío y dime qué permisos usa y por qué."

El agente usa REA para inspeccionar el objetivo y te devuelve una explicación con **evidencias y
limitaciones**. El análisis se ejecuta **en local**.

## Usar REA desde tu iPhone (en la nube)

REA **no puede ejecutarse dentro del iPhone** (iOS no corre Node ni Ghidra/JADX, y
no tiene interfaz propia: es solo un servidor MCP para un agente). Lo que sí puedes
hacer es que el iPhone sea la **pantalla** de REA corriendo en la nube:

1. En el Safari de tu iPhone, abre **https://claude.ai/code**.
2. Abre **este proyecto**. El contenedor en la nube trae Node, y este repo ya incluye
   la configuración de REA en [`.mcp.json`](.mcp.json).
3. En los **ajustes del entorno** (menú del entorno, en la barra de título → *Edit* →
   *Setup script*), añade esta línea para que REA se instale al arrancar cada sesión:
   ```bash
   npm install -g rea-agents@6.5.0
   ```
4. Abre una sesión nueva y pídele al agente que analice algo **tuyo**.

Límites honestos de la vía nube:
- El contenedor es **temporal**: lo que instales se borra al cerrarse.
- La primera instalación puede pedirte **aprobación** (es una protección de seguridad).
- Los motores nativos pesados (**Ghidra/JADX/Binwalk**) pueden no estar disponibles en
  el contenedor; las herramientas comerciales (**IDA/Hopper**) no se pueden alojar.
- Objetivos realistas por esta vía: archivos **tuyos** que subas, o análisis de
  comportamiento/tráfico. Para ingeniería inversa nativa seria, mejor un ordenador.

## Notas para Windows 10

- Instala Node desde el instalador `.msi` de nodejs.org (LTS).
- Abre **PowerShell** y ejecuta los comandos de arriba.
- Las herramientas de análisis nativo (Ghidra/JADX/Binwalk) son pesadas; en un equipo antiguo
  conviene empezar solo con lo que necesites para tu primer objetivo.

---

Documentación y detalles completos: https://github.com/morluto/rea

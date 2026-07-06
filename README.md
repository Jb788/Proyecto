# AetherProxy 🌐

**AetherProxy** es un proxy web interceptor ligero y auto-hospedado, diseñado para analizar, interceptar y modificar el tráfico HTTP/HTTPS en tiempo real. Inspirado en herramientas profesionales como *Burp Suite* u *OWASP ZAP*, AetherProxy ofrece una interfaz web moderna y fluida para inspeccionar y manipular peticiones directamente desde tu navegador.

---

## 🚀 Características Principales

- **Historial en Tiempo Real**: Visualiza el flujo de peticiones entrantes y salientes (método, URL, cabeceras, cuerpo, códigos de estado) actualizado al instante a través de WebSockets.
- **Interceptador Interactivo**: Pausa peticiones HTTP normales antes de que salgan a internet. Puedes inspeccionarlas y editarlas (tanto en formato estructurado como HTTP Raw) y decidir si enviarlas (**Forward**) o descartarlas (**Drop**).
- **Control Paso a Paso Fluido**: La cola de interceptación avanza automáticamente a la siguiente petición en espera al procesar la actual, optimizando el flujo de depuración.
- **Filtro Inteligente de Recursos Estáticos**: Evita bloqueos y congelamientos del navegador ignorando la interceptación de archivos estáticos comunes (CSS, JS, imágenes, fuentes, etc.) de forma opcional.
- **Evitado de Deadlocks**: Excluye automáticamente el tráfico dirigido a su propio panel de control y conexiones WebSocket de control para mantener la interfaz siempre activa.
- **Repeater (Repetidor)**: Modifica y reenvía peticiones HTTP personalizadas de manera independiente al navegador para analizar el comportamiento y respuestas del servidor.
- **Túnel HTTPS CONNECT**: Permite relay directo y transparente de conexiones seguras (HTTPS pasante).

---

## 🛠️ Requisitos del Sistema

- **Python 3.8** o superior.
- Navegador web moderno (Chrome, Firefox, Edge, Safari).
- Permisos para abrir y enlazar puertos locales (`8000` y `8080`).

---

## 📥 Instalación

Sigue estos pasos para configurar y ejecutar el proyecto en tu entorno local:

### 1. Clonar el Repositorio
Si aún no tienes el código localmente, clona el repositorio desde GitHub:
```bash
git clone https://github.com/Jb788/Proyecto.git
cd Proyecto
```

### 2. Crear un Entorno Virtual (Opcional pero recomendado)
Crea y activa un entorno virtual de Python para mantener aisladas las dependencias:
```bash
# En Linux/macOS
python3 -m venv venv
source venv/bin/activate

# En Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Instalar Dependencias
Instala los paquetes necesarios utilizando `pip`:
```bash
pip install fastapi uvicorn httpx
```

---

## 🏁 Cómo Ejecutar el Proxy

Inicia el servidor principal ejecutando el archivo `server.py`:
```bash
python server.py
```

Al iniciar, el sistema levantará dos puertos clave:
- **Puerto 8000**: Panel de control web (`http://localhost:8000`).
- **Puerto 8080**: Motor del Proxy TCP/HTTP (`127.0.0.1:8080`).

---

## ⚙️ Configuración del Navegador

Para capturar y analizar el tráfico de tu navegador o de tu sitio web en desarrollo, debes configurar el navegador para enrutar su tráfico a través de AetherProxy:

### Opción A: Configuración del Sistema o Navegador (Manual)
1. Ve a los ajustes de red de tu navegador o sistema operativo.
2. Configura un **Proxy HTTP/HTTPS manual**.
3. Dirección/Host: `127.0.0.1` o `localhost`.
4. Puerto: `8080`.
5. *(Opcional)* Asegúrate de desactivar la opción "Omitir proxy para direcciones locales" si quieres depurar servidores que corran en tu propio `localhost` (como puertos `3000`, `5000`, etc.).

### Opción B: Uso de extensiones (Recomendado)
Para una activación/desactivación rápida y cómoda, puedes usar extensiones de navegador como:
- [FoxyProxy Standard](https://getfoxyproxy.org/) (Chrome/Firefox)
- [SwitchyOmega](https://github.com/FelisCatus/SwitchyOmega) (Chrome/Firefox)

Solo crea un perfil HTTP apuntando a `127.0.0.1:8080` y actívalo cuando desees interceptar el tráfico.

---

## 📂 Estructura del Proyecto

```text
├── server.py         # Código del Backend (FastAPI, Servidor Proxy TCP/asyncio)
├── static/           # Archivos del Frontend (Interfaz de Usuario)
│   ├── index.html    # Estructura del Panel de Control
│   ├── style.css     # Estilos Visuales del Panel
│   └── app.js        # Motor Lógico del Frontend (WebSocket, HTTP client)
├── README.md         # Documentación del Proyecto
└── requirements.txt  # Archivo de dependencias de Python (si se genera)
```

---

## 🔒 Consideraciones de Seguridad

- **Tráfico HTTPS**: AetherProxy utiliza un túnel CONNECT transparente para HTTPS sin desencriptación (MITM). Esto significa que no lee ni modifica el tráfico cifrado de extremo a extremo, lo cual asegura que tus credenciales de sitios seguros externos no sean interceptadas por este proxy.
- **Uso Local**: Este proxy está diseñado para tareas de desarrollo local, auditorías de seguridad rápidas y educación. No lo expongas públicamente a internet sin la debida autenticación o protección de red.

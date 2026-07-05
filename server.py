import asyncio
import uuid
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from typing import Dict, List, Any

# Configurar logs
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("AetherProxy")

app = FastAPI(title="AetherProxy Control Panel")

# Habilitar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estado global
history: List[Dict[str, Any]] = []
intercepted_requests: Dict[str, Dict[str, Any]] = {}
intercept_enabled = False

# Gestor de conexiones WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("Cliente WebSocket conectado.")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info("Cliente WebSocket desconectado.")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error al enviar mensaje por WebSocket: {e}")

manager = ConnectionManager()

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Enviar historial actual al conectar
        await websocket.send_text(json.dumps({
            "type": "init",
            "history": history,
            "intercept_enabled": intercept_enabled
        }))
        while True:
            # Mantener la conexión abierta
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# API de Control
class InterceptConfig(BaseModel):
    enabled: bool

@app.post("/api/intercept/toggle")
async def toggle_intercept(config: InterceptConfig):
    global intercept_enabled
    intercept_enabled = config.enabled
    logger.info(f"Interceptación cambiada a: {intercept_enabled}")
    await manager.broadcast({"type": "intercept_toggle", "enabled": intercept_enabled})
    return {"status": "ok", "intercept_enabled": intercept_enabled}

class InterceptAction(BaseModel):
    id: str
    action: str  # "forward" o "drop"
    raw_request: str

@app.post("/api/intercept/action")
async def intercept_action(action_data: InterceptAction):
    req_id = action_data.id
    if req_id not in intercepted_requests:
        raise HTTPException(status_code=404, detail="Petición no encontrada o ya procesada.")
    
    req_info = intercepted_requests[req_id]
    req_info["decision"] = action_data.action
    req_info["modified_request"] = action_data.raw_request.encode('utf-8')
    req_info["event"].set()
    return {"status": "ok"}

class RepeatRequest(BaseModel):
    method: str
    url: str
    headers: Dict[str, str]
    body: str

@app.post("/api/repeater/send")
async def repeater_send(req: RepeatRequest):
    try:
        async with httpx.AsyncClient(follow_redirects=False, verify=False) as client:
            # Filtrar headers de control o que puedan causar conflicto
            headers = {k: v for k, v in req.headers.items() if k.lower() not in ["content-length", "host"]}
            
            logger.info(f"Enviando petición Repeater a {req.url}")
            
            response = await client.request(
                method=req.method,
                url=req.url,
                headers=headers,
                content=req.body,
                timeout=15.0
            )
            
            # Formatear respuesta
            res_headers = dict(response.headers)
            res_body = response.text
            
            return {
                "status": "ok",
                "response": {
                    "status_code": response.status_code,
                    "reason_phrase": response.extensions.get("reason_phrase", b"OK").decode("latin1"),
                    "http_version": response.http_version,
                    "headers": res_headers,
                    "body": res_body
                }
            }
    except Exception as e:
        logger.error(f"Error en Repeater: {e}")
        return {
            "status": "error",
            "message": str(e)
        }

@app.post("/api/history/clear")
async def clear_history():
    global history
    history.clear()
    await manager.broadcast({"type": "history_clear"})
    return {"status": "ok"}

# --- MOTOR PROXY TCP (SOCKETS) ---

async def handle_client(client_reader: asyncio.StreamReader, client_writer: asyncio.StreamWriter):
    try:
        # Leer cabecera inicial de la petición
        header_data = b""
        while b"\r\n\r\n" not in header_data:
            chunk = await client_reader.read(4096)
            if not chunk:
                break
            header_data += chunk
            if len(header_data) > 65536: # Límite de cabecera
                break

        if not header_data:
            client_writer.close()
            return

        parts = header_data.split(b"\r\n\r\n", 1)
        headers_part = parts[0]
        body_part = parts[1] if len(parts) > 1 else b""

        # Parsear primera línea
        lines = headers_part.split(b"\r\n")
        first_line = lines[0].decode('utf-8', errors='ignore')
        first_line_parts = first_line.split(" ")
        if len(first_line_parts) < 3:
            client_writer.close()
            return

        method, url, version = first_line_parts[0], first_line_parts[1], first_line_parts[2]

        # Parsear cabeceras
        headers_dict = {}
        for line in lines[1:]:
            if b":" in line:
                k, v = line.split(b":", 1)
                headers_dict[k.decode('utf-8').strip().lower()] = v.decode('utf-8').strip()

        # Determinar host y puerto
        host = ""
        port = 80
        if "host" in headers_dict:
            host_header = headers_dict["host"]
            if ":" in host_header:
                host, port_str = host_header.split(":", 1)
                port = int(port_str)
            else:
                host = host_header
                port = 443 if method == "CONNECT" else 80
        else:
            # Intentar extraer del URL
            if url.startswith("http://") or url.startswith("https://"):
                temp = url.split("//", 1)[1]
                temp_host = temp.split("/", 1)[0]
                if ":" in temp_host:
                    host, port_str = temp_host.split(":", 1)
                    port = int(port_str)
                else:
                    host = temp_host
                    port = 80

        if not host:
            client_writer.close()
            return

        # --- CASO A: TÚNEL HTTPS (CONNECT) ---
        if method == "CONNECT":
            logger.info(f"Túnel CONNECT creado para: {host}:{port}")
            # Registrar túnel en el historial (pasante)
            req_id = str(uuid.uuid4())
            item = {
                "id": req_id,
                "method": "CONNECT",
                "url": f"https://{host}:{port}/",
                "status_code": 200,
                "request_headers": {"Host": f"{host}:{port}"},
                "request_body": "",
                "response_headers": {},
                "response_body": "Túnel HTTPS establecido. Tráfico encriptado pasante (sin desencriptación)."
            }
            history.append(item)
            await manager.broadcast({"type": "new_request", "request": item})

            # Responder al cliente que el túnel está listo
            client_writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            await client_writer.drain()

            # Conectar al destino real
            try:
                target_reader, target_writer = await asyncio.open_connection(host, port)
            except Exception as e:
                logger.error(f"Error al abrir túnel hacia {host}:{port}: {e}")
                client_writer.close()
                return

            # Relayar bidireccionalmente
            async def relay(reader, writer):
                try:
                    while True:
                        data = await reader.read(4096)
                        if not data:
                            break
                        writer.write(data)
                        await writer.drain()
                except Exception:
                    pass
                finally:
                    writer.close()

            asyncio.create_task(relay(client_reader, target_writer))
            asyncio.create_task(relay(target_reader, client_writer))
            return

        # --- CASO B: HTTP NORMAL (INTERCEPTABLE) ---
        # Leer cuerpo completo si tiene Content-Length
        content_length = int(headers_dict.get("content-length", 0))
        body = body_part
        if len(body) < content_length:
            remaining = content_length - len(body)
            body += await client_reader.readexactly(remaining)

        # Construir petición completa
        raw_req_headers = headers_part + b"\r\n\r\n"
        raw_req = raw_req_headers + body

        # Interceptación
        if intercept_enabled:
            req_id = str(uuid.uuid4())
            event = asyncio.Event()
            intercepted_requests[req_id] = {
                "id": req_id,
                "raw_request": raw_req,
                "event": event,
                "decision": None,
                "modified_request": None
            }

            # Enviar detalles al frontend
            await manager.broadcast({
                "type": "intercept_request",
                "request": {
                    "id": req_id,
                    "method": method,
                    "url": url,
                    "headers": headers_dict,
                    "body": body.decode('utf-8', errors='ignore'),
                    "raw": raw_req.decode('utf-8', errors='ignore')
                }
            })

            # Esperar a que el usuario decida (Forward o Drop)
            await event.wait()

            decision_info = intercepted_requests.get(req_id)
            if not decision_info or decision_info["decision"] == "drop":
                logger.info(f"Petición {req_id} descartada (Dropped) por el usuario.")
                client_writer.close()
                return
            
            # Usar la petición modificada
            raw_req = decision_info["modified_request"]
            # Re-parsear el host y path por si cambiaron en la edición manual
            parts = raw_req.split(b"\r\n\r\n", 1)
            headers_part = parts[0]
            body = parts[1] if len(parts) > 1 else b""
            lines = headers_part.split(b"\r\n")
            first_line = lines[0].decode('utf-8', errors='ignore')
            first_line_parts = first_line.split(" ")
            method, url = first_line_parts[0], first_line_parts[1]
            # Actualizar headers
            headers_dict = {}
            for line in lines[1:]:
                if b":" in line:
                    k, v = line.split(b":", 1)
                    headers_dict[k.decode('utf-8').strip().lower()] = v.decode('utf-8').strip()
            if "host" in headers_dict:
                host_header = headers_dict["host"]
                if ":" in host_header:
                    host, port_str = host_header.split(":", 1)
                    port = int(port_str)
                else:
                    host = host_header
                    port = 80

        # Conectar al servidor destino
        try:
            target_reader, target_writer = await asyncio.open_connection(host, port)
        except Exception as e:
            logger.error(f"Error al conectar a {host}:{port}: {e}")
            client_writer.close()
            return

        # Enviar petición modificada/original
        # Ajustar la línea inicial para que sea una petición de proxy limpia o directa
        if url.startswith("http://"):
            # Extraer path relativo
            path = url.split("//", 1)[1]
            if "/" in path:
                path = "/" + path.split("/", 1)[1]
            else:
                path = "/"
        else:
            path = url

        new_first_line = f"{method} {path} HTTP/1.1\r\n".encode('utf-8')
        new_headers = new_first_line + b"\r\n".join(headers_part.split(b"\r\n")[1:]) + b"\r\n\r\n"
        
        target_writer.write(new_headers + body)
        await target_writer.drain()

        # Recibir respuesta del servidor
        response_data = b""
        while True:
            chunk = await target_reader.read(4096)
            if not chunk:
                break
            response_data += chunk
            # Enviar de inmediato al cliente para velocidad
            client_writer.write(chunk)
            await client_writer.drain()

        target_writer.close()
        client_writer.close()

        # Parsear respuesta para el historial
        if response_data:
            res_parts = response_data.split(b"\r\n\r\n", 1)
            res_headers_part = res_parts[0]
            res_body = res_parts[1] if len(res_parts) > 1 else b""

            res_lines = res_headers_part.split(b"\r\n")
            res_status_line = res_lines[0].decode('utf-8', errors='ignore')
            status_code = 200
            try:
                status_code = int(res_status_line.split(" ")[1])
            except:
                pass

            res_headers_dict = {}
            for line in res_lines[1:]:
                if b":" in line:
                    k, v = line.split(b":", 1)
                    res_headers_dict[k.decode('utf-8').strip()] = v.decode('utf-8').strip()

            # Guardar en historial
            req_id = str(uuid.uuid4())
            item = {
                "id": req_id,
                "method": method,
                "url": url if url.startswith("http") else f"http://{host}{url}",
                "status_code": status_code,
                "request_headers": headers_dict,
                "request_body": body.decode('utf-8', errors='ignore'),
                "response_headers": res_headers_dict,
                "response_body": res_body.decode('utf-8', errors='ignore')
            }
            history.append(item)
            # Limitar historial en memoria
            if len(history) > 500:
                history.pop(0)
            await manager.broadcast({"type": "new_request", "request": item})

    except Exception as e:
        logger.error(f"Error procesando petición: {e}")
        try:
            client_writer.close()
        except:
            pass

async def start_proxy_server():
    server = await asyncio.start_server(handle_client, '0.0.0.0', 8080)
    logger.info("Motor Proxy escuchando en puerto 8080 (HTTP/HTTPS Connect)")
    async with server:
        await server.serve_forever()

from contextlib import asynccontextmanager

# Iniciar el proxy al arrancar FastAPI
@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(start_proxy_server())
    yield

app.router.lifespan_context = lifespan

# Servir Frontend estático
app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

// ==========================================================================
// AETHERPROXY FRONTEND ENGINE
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Estado global de la UI
    let ws = null;
    let currentHistory = [];
    let selectedRequest = null;
    let currentInterceptedRequest = null;
    let interceptedRequestsList = [];

    // Elementos DOM
    const navItems = document.querySelectorAll('.nav-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Historial
    const historyRows = document.getElementById('history-rows');
    const detailPanel = document.getElementById('detail-panel');
    const detailContent = detailPanel.querySelector('.detail-content');
    const detailEmpty = detailPanel.querySelector('.detail-empty');
    const detailText = document.getElementById('detail-text');
    const detailTabBtns = document.querySelectorAll('.detail-tab-btn');
    const sendToRepeaterBtn = document.getElementById('send-to-repeater-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // Interceptación
    const interceptToggle = document.getElementById('intercept-toggle');
    const interceptStatusText = document.getElementById('intercept-status-text');
    const interceptIgnoreStaticToggle = document.getElementById('intercept-ignore-static-toggle');
    const interceptIgnoreStaticText = document.getElementById('intercept-ignore-static-text');
    const interceptBadge = document.getElementById('intercept-badge');
    const interceptEmpty = document.getElementById('intercept-empty');
    const interceptSplitView = document.getElementById('intercept-split-view');
    const interceptRows = document.getElementById('intercept-rows');
    const interceptEditorEmpty = document.getElementById('intercept-editor-empty');
    const interceptEditorContent = document.getElementById('intercept-editor-content');
    const interceptBadgeMethod = document.getElementById('intercept-badge-method');
    const interceptUrlText = document.getElementById('intercept-url-text');
    const interceptRawTextarea = document.getElementById('intercept-raw-textarea');
    const interceptForwardBtn = document.getElementById('intercept-forward-btn');
    const interceptDropBtn = document.getElementById('intercept-drop-btn');

    // Repeater
    const repeaterMethod = document.getElementById('repeater-method');
    const repeaterUrl = document.getElementById('repeater-url');
    const repeaterSendBtn = document.getElementById('repeater-send-btn');
    const repeaterHeadersTextarea = document.getElementById('repeater-headers-textarea');
    const repeaterBodyTextarea = document.getElementById('repeater-body-textarea');
    const repeaterResStatus = document.getElementById('repeater-res-status');
    const repeaterResHeaders = document.getElementById('repeater-res-headers');
    const repeaterResBody = document.getElementById('repeater-res-body');
    const repeaterLoader = document.getElementById('repeater-loader');
    const repeaterSubtabs = document.querySelectorAll('[data-subtab^="rep-"]');

    // Interceptador Estructurado
    const interceptMethod = document.getElementById('intercept-method');
    const interceptUrl = document.getElementById('intercept-url');
    const interceptHeadersList = document.getElementById('intercept-headers-list');
    const interceptAddHeaderBtn = document.getElementById('intercept-add-header-btn');
    const interceptBodyTextarea = document.getElementById('intercept-body-textarea');
    const interceptStructuredPane = document.getElementById('intercept-structured-pane');
    const interceptRawPane = document.getElementById('intercept-raw-pane');
    const interceptSubtabs = document.querySelectorAll('[data-subtab^="intercept-"]');

    // ==========================================================================
    // SISTEMA DE PESTAÑAS (TABS)
    // ==========================================================================
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetTab = item.getAttribute('data-tab');
            
            navItems.forEach(n => n.classList.remove('active'));
            tabPanes.forEach(t => t.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

    // Pestañas internas de detalles (Historial)
    let activeDetailTab = 'req-headers';
    detailTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            detailTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDetailTab = btn.getAttribute('data-detail-tab');
            renderDetailTab();
        });
    });

    // Pestañas internas de Repeater
    repeaterSubtabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.getAttribute('data-subtab').startsWith('rep-res') ? 'response' : 'request';
            
            // Desactivar botones hermanos
            const query = group === 'response' 
                ? '[data-subtab^="rep-res"]' 
                : '[data-subtab^="rep-"]:not([data-subtab^="rep-res"])';
            
            document.querySelectorAll(query).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Intercambiar contenido
            const target = btn.getAttribute('data-subtab');
            if (group === 'request') {
                if (target === 'rep-headers') {
                    repeaterHeadersTextarea.style.display = 'block';
                    repeaterBodyTextarea.style.display = 'none';
                } else {
                    repeaterHeadersTextarea.style.display = 'none';
                    repeaterBodyTextarea.style.display = 'block';
                }
            } else {
                if (target === 'rep-res-headers') {
                    repeaterResHeaders.style.display = 'block';
                    repeaterResBody.style.display = 'none';
                } else {
                    repeaterResHeaders.style.display = 'none';
                    repeaterResBody.style.display = 'block';
                }
            }
        });
    });

    // ==========================================================================
    // CONEXIÓN WEBSOCKET (REAL-TIME DATA)
    // ==========================================================================
    function connectWS() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('Conectado al servidor de WebSocket.');
        };

        ws.onclose = () => {
            console.log('Conexión perdida. Reintentando en 3 segundos...');
            setTimeout(connectWS, 3000);
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            
            switch (msg.type) {
                case 'init':
                    currentHistory = msg.history;
                    updateInterceptToggleUI(msg.intercept_enabled);
                    updateIgnoreStaticToggleUI(msg.ignore_static_enabled);
                    renderHistory();
                    if (msg.pending_intercepts) {
                        interceptedRequestsList = msg.pending_intercepts;
                        renderInterceptedRequests();
                    }
                    break;
                
                case 'new_request':
                    currentHistory.push(msg.request);
                    appendHistoryRow(msg.request);
                    break;

                case 'intercept_toggle':
                    updateInterceptToggleUI(msg.enabled);
                    break;

                case 'ignore_static_toggle':
                    updateIgnoreStaticToggleUI(msg.enabled);
                    break;

                case 'intercept_request':
                    interceptedRequestsList.push(msg.request);
                    renderInterceptedRequests();
                    break;

                case 'intercept_toggle_confirm':
                    updateInterceptToggleUI(msg.enabled);
                    break;

                case 'history_clear':
                    currentHistory = [];
                    renderHistory();
                    // Limpiar panel de detalles
                    detailContent.style.display = 'none';
                    detailEmpty.style.display = 'flex';
                    break;
            }
        };
    }

    connectWS();

    // ==========================================================================
    // RENDERIZADO DE HISTORIAL
    // ==========================================================================
    function renderHistory() {
        if (currentHistory.length === 0) {
            historyRows.innerHTML = `
                <tr class="empty-state">
                    <td colspan="5">
                        <div class="empty-icon"><i class="fa-solid fa-ethernet"></i></div>
                        <p>Esperando tráfico... Configura tu navegador para usar el proxy (puerto 8080).</p>
                    </td>
                </tr>
            `;
            return;
        }

        historyRows.innerHTML = '';
        currentHistory.forEach((req, index) => {
            appendHistoryRow(req, index + 1);
        });
    }

    function appendHistoryRow(req, displayIndex) {
        // Eliminar fila vacía si existe
        const emptyRow = historyRows.querySelector('.empty-state');
        if (emptyRow) {
            historyRows.innerHTML = '';
        }

        const index = displayIndex || historyRows.children.length + 1;
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', req.id);
        
        if (selectedRequest && selectedRequest.id === req.id) {
            tr.classList.add('active');
        }

        // Método badge class
        const methodClass = req.method.toLowerCase();
        
        // Status color class
        let statusDot = 'status-dot';
        if (req.status_code >= 200 && req.status_code < 300) statusDot += ' green';
        else if (req.status_code >= 300 && req.status_code < 400) statusDot += ' yellow';
        else if (req.status_code >= 400) statusDot += ' red';

        tr.innerHTML = `
            <td>${index}</td>
            <td><span class="method-badge ${methodClass}">${req.method}</span></td>
            <td class="url-text" style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${req.url}
            </td>
            <td>
                <div class="status-dot-cell">
                    <span class="${statusDot}"></span>
                    <span>${req.status_code}</span>
                </div>
            </td>
            <td>${req.request_headers['host'] || req.request_headers['Host'] || 'N/A'}</td>
        `;

        tr.addEventListener('click', () => {
            // Quitar clase activa de todas las filas
            historyRows.querySelectorAll('tr').forEach(r => r.classList.remove('active'));
            tr.classList.add('active');
            
            selectedRequest = req;
            showDetails(req);
        });

        // Insertar al inicio o al final según preferencia (al final es estándar para ver fluir)
        historyRows.appendChild(tr);
        
        // Auto Scroll hacia abajo en la tabla de historial
        const container = historyRows.parentElement.parentElement;
        container.scrollTop = container.scrollHeight;
    }

    // ==========================================================================
    // DETALLES DE PETICIÓN
    // ==========================================================================
    function showDetails(req) {
        detailEmpty.style.display = 'none';
        detailContent.style.display = 'flex';
        renderDetailTab();
    }

    function renderDetailTab() {
        if (!selectedRequest) return;
        
        let textContent = '';
        
        switch (activeDetailTab) {
            case 'req-headers':
                textContent = Object.entries(selectedRequest.request_headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n');
                if (!textContent) textContent = '(Sin cabeceras)';
                break;
                
            case 'req-body':
                textContent = selectedRequest.request_body || '(Cuerpo vacío)';
                break;
                
            case 'res-headers':
                textContent = Object.entries(selectedRequest.response_headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n');
                if (!textContent) textContent = '(Sin cabeceras de respuesta)';
                break;
                
            case 'res-body':
                textContent = selectedRequest.response_body || '(Cuerpo vacío)';
                break;
        }
        
        detailText.textContent = textContent;
    }

    // Limpiar Historial
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('¿Estás seguro de que quieres limpiar todo el historial?')) {
            await fetch('/api/history/clear', { method: 'POST' });
        }
    });

    // Enviar del Historial al Repeater
    sendToRepeaterBtn.addEventListener('click', () => {
        if (!selectedRequest) return;
        
        // Rellenar pestaña Repeater
        repeaterMethod.value = selectedRequest.method;
        repeaterUrl.value = selectedRequest.url;
        
        // Headers a formato JSON
        repeaterHeadersTextarea.value = JSON.stringify(selectedRequest.request_headers, null, 2);
        repeaterBodyTextarea.value = selectedRequest.request_body || '';

        // Limpiar respuesta previa del Repeater
        repeaterResStatus.style.display = 'none';
        repeaterResHeaders.textContent = '';
        repeaterResBody.textContent = '';
        
        // Cambiar a pestaña Repeater
        const repeaterTabBtn = document.querySelector('[data-tab="repeater"]');
        repeaterTabBtn.click();
    });

    // ==========================================================================
    // SISTEMA DE INTERCEPTACIÓN
    // ==========================================================================
    function updateInterceptToggleUI(enabled) {
        interceptToggle.checked = enabled;
        if (enabled) {
            interceptStatusText.textContent = "Intercept ON";
            interceptStatusText.style.color = "var(--success)";
        } else {
            interceptStatusText.textContent = "Intercept OFF";
            interceptStatusText.style.color = "var(--text-muted)";
            
            // Vaciar lista de peticiones en espera y refrescar UI
            interceptedRequestsList = [];
            currentInterceptedRequest = null;
            renderInterceptedRequests();
        }
    }

    interceptToggle.addEventListener('change', async () => {
        const enabled = interceptToggle.checked;
        await fetch('/api/intercept/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
    });

    function updateIgnoreStaticToggleUI(enabled) {
        if (interceptIgnoreStaticToggle) {
            interceptIgnoreStaticToggle.checked = enabled;
        }
        if (interceptIgnoreStaticText) {
            if (enabled) {
                interceptIgnoreStaticText.style.color = "var(--success)";
            } else {
                interceptIgnoreStaticText.style.color = "var(--text-muted)";
            }
        }
    }

    if (interceptIgnoreStaticToggle) {
        interceptIgnoreStaticToggle.addEventListener('change', async () => {
            const enabled = interceptIgnoreStaticToggle.checked;
            await fetch('/api/intercept/ignore_static', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
        });
    }

    function renderInterceptedRequests() {
        // Actualizar el badge del menú de navegación lateral
        if (interceptedRequestsList.length > 0) {
            interceptBadge.style.display = 'inline-block';
            interceptBadge.textContent = interceptedRequestsList.length;
        } else {
            interceptBadge.style.display = 'none';
        }

        if (interceptedRequestsList.length === 0) {
            interceptEmpty.style.display = 'flex';
            interceptSplitView.style.display = 'none';
            currentInterceptedRequest = null;
            return;
        }

        interceptEmpty.style.display = 'none';
        interceptSplitView.style.display = 'flex';

        // Renderizar filas en la tabla
        interceptRows.innerHTML = '';
        interceptedRequestsList.forEach((req) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-id', req.id);
            if (currentInterceptedRequest && currentInterceptedRequest.id === req.id) {
                tr.classList.add('active');
            }

            const methodClass = req.method.toLowerCase();
            const hostDisplay = req.headers['host'] || req.headers['Host'] || req.url;

            tr.innerHTML = `
                <td><span class="method-badge ${methodClass}">${req.method}</span></td>
                <td class="url-text" style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${hostDisplay}
                </td>
            `;

            tr.addEventListener('click', () => {
                interceptRows.querySelectorAll('tr').forEach(r => r.classList.remove('active'));
                tr.classList.add('active');
                selectInterceptedRequest(req);
            });

            interceptRows.appendChild(tr);
        });

        // Si se limpió la seleccionada o no hay ninguna seleccionada, ocultar editor
        if (!currentInterceptedRequest) {
            interceptEditorEmpty.style.display = 'flex';
            interceptEditorContent.style.display = 'none';
        } else {
            // Asegurar que la fila seleccionada tenga clase active
            const activeRow = interceptRows.querySelector(`tr[data-id="${currentInterceptedRequest.id}"]`);
            if (activeRow) activeRow.classList.add('active');
        }
    }

    // Manejo de subpestañas del editor de interceptación
    interceptSubtabs.forEach(btn => {
        btn.addEventListener('click', () => {
            interceptSubtabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const target = btn.getAttribute('data-subtab');
            if (target === 'intercept-structured') {
                // Sincronizar de Raw a Formulario antes de mostrarlo
                syncRawToForm();
                interceptStructuredPane.style.display = 'flex';
                interceptRawPane.style.display = 'none';
            } else {
                // Sincronizar de Formulario a Raw antes de mostrarlo
                syncFormToRaw();
                interceptStructuredPane.style.display = 'none';
                interceptRawPane.style.display = 'block';
            }
        });
    });

    // Añadir cabecera vacía en el Formulario
    interceptAddHeaderBtn.addEventListener('click', () => {
        addHeaderRow('', '');
    });

    // Sincronizar Formulario -> Raw
    function syncFormToRaw() {
        const method = interceptMethod.value;
        const url = interceptUrl.value;
        
        // Obtener cabeceras
        const headers = [];
        interceptHeadersList.querySelectorAll('.intercept-header-row').forEach(row => {
            const key = row.querySelector('.header-key').value.trim();
            const val = row.querySelector('.header-value').value.trim();
            if (key) {
                headers.push(`${key}: ${val}`);
            }
        });
        
        const body = interceptBodyTextarea.value;
        
        let raw = `${method} ${url} HTTP/1.1\r\n`;
        if (headers.length > 0) {
            raw += headers.join('\r\n') + '\r\n';
        }
        raw += '\r\n';
        raw += body;
        
        interceptRawTextarea.value = raw;
    }

    // Sincronizar Raw -> Formulario
    function syncRawToForm() {
        const raw = interceptRawTextarea.value;
        const parsed = parseRawRequest(raw);
        
        interceptMethod.value = parsed.method;
        interceptUrl.value = parsed.url;
        interceptBodyTextarea.value = parsed.body;
        
        // Rellenar cabeceras
        renderHeadersList(parsed.headers);
    }

    // Parseador helper de petición raw
    function parseRawRequest(rawText) {
        // Normalizar saltos de línea a \n
        const normalized = rawText.replace(/\r\n/g, '\n');
        const parts = normalized.split('\n\n');
        const headersPart = parts[0] || '';
        const body = parts.slice(1).join('\n\n'); // En caso de que haya más \n\n en el cuerpo
        
        const lines = headersPart.split('\n');
        const firstLine = lines[0] || '';
        const firstLineParts = firstLine.split(/\s+/);
        
        const method = firstLineParts[0] || 'GET';
        // Conservar el path completo
        const url = firstLineParts[1] || '';
        
        const headers = {};
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                const k = line.substring(0, colonIdx).trim();
                const v = line.substring(colonIdx + 1).trim();
                headers[k] = v;
            }
        }
        
        return { method, url, headers, body };
    }

    function renderHeadersList(headersObj) {
        interceptHeadersList.innerHTML = '';
        Object.entries(headersObj).forEach(([key, val]) => {
            addHeaderRow(key, val);
        });
        
        // Si está vacío, añadir una fila vacía para comodidad
        if (Object.keys(headersObj).length === 0) {
            addHeaderRow('', '');
        }
    }

    function addHeaderRow(key = '', val = '') {
        const row = document.createElement('div');
        row.className = 'intercept-header-row';
        
        row.innerHTML = `
            <input type="text" class="header-key" placeholder="Cabecera" value="${escapeHtml(key)}">
            <input type="text" class="header-value" placeholder="Valor" value="${escapeHtml(val)}">
            <button type="button" class="btn-delete-header" title="Eliminar Cabecera">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        
        // Eliminar fila
        row.querySelector('.btn-delete-header').addEventListener('click', () => {
            row.remove();
        });
        
        interceptHeadersList.appendChild(row);
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function selectInterceptedRequest(req) {
        currentInterceptedRequest = req;
        interceptEditorEmpty.style.display = 'none';
        interceptEditorContent.style.display = 'flex';

        // Cargar datos en el editor
        interceptBadgeMethod.className = `method-badge ${req.method.toLowerCase()}`;
        interceptBadgeMethod.textContent = req.method;
        interceptUrlText.textContent = req.url;
        
        // Por defecto, resetear a la pestaña Formulario activa
        interceptSubtabs.forEach(b => b.classList.remove('active'));
        const formSubtab = document.querySelector('[data-subtab="intercept-structured"]');
        if (formSubtab) formSubtab.classList.add('active');
        interceptStructuredPane.style.display = 'flex';
        interceptRawPane.style.display = 'none';

        // Cargar en los campos del formulario
        interceptMethod.value = req.method;
        interceptUrl.value = req.url;
        interceptBodyTextarea.value = req.body;
        renderHeadersList(req.headers);

        // Cargar en Raw
        interceptRawTextarea.value = req.raw;
    }

    function removeInterceptedRequest(id) {
        const index = interceptedRequestsList.findIndex(r => r.id === id);
        interceptedRequestsList = interceptedRequestsList.filter(r => r.id !== id);
        
        if (currentInterceptedRequest && currentInterceptedRequest.id === id) {
            if (interceptedRequestsList.length > 0) {
                const nextIndex = Math.min(index, interceptedRequestsList.length - 1);
                currentInterceptedRequest = interceptedRequestsList[nextIndex];
            } else {
                currentInterceptedRequest = null;
            }
        }

        renderInterceptedRequests();

        if (currentInterceptedRequest) {
            selectInterceptedRequest(currentInterceptedRequest);
        }
    }

    // Acción Forward
    interceptForwardBtn.addEventListener('click', async () => {
        if (!currentInterceptedRequest) return;
        
        // Asegurar que si está en Formulario, sincronizamos a Raw antes de enviar
        const activeSubtab = document.querySelector('[data-subtab^="intercept-"].active');
        if (activeSubtab && activeSubtab.getAttribute('data-subtab') === 'intercept-structured') {
            syncFormToRaw();
        }
        
        const modifiedRaw = interceptRawTextarea.value;
        const res = await fetch('/api/intercept/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: currentInterceptedRequest.id,
                action: 'forward',
                raw_request: modifiedRaw
            })
        });
        if (res.ok) {
            removeInterceptedRequest(currentInterceptedRequest.id);
        }
    });

    // Acción Drop
    interceptDropBtn.addEventListener('click', async () => {
        if (!currentInterceptedRequest) return;
        
        if (confirm('¿Descartar esta petición? El navegador recibirá un error de conexión.')) {
            const res = await fetch('/api/intercept/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: currentInterceptedRequest.id,
                    action: 'drop',
                    raw_request: ''
                })
            });
            if (res.ok) {
                removeInterceptedRequest(currentInterceptedRequest.id);
            }
        }
    });

    // ==========================================================================
    // SISTEMA DEL REPEATER (REPETIDOR)
    // ==========================================================================
    repeaterSendBtn.addEventListener('click', async () => {
        const method = repeaterMethod.value;
        const url = repeaterUrl.value;
        
        if (!url) {
            alert('Por favor, ingresa una URL válida.');
            return;
        }

        let headers = {};
        try {
            const headerText = repeaterHeadersTextarea.value.trim();
            if (headerText) {
                headers = JSON.parse(headerText);
            }
        } catch (e) {
            alert('Error parseando las cabeceras JSON del Repeater. Asegúrate de usar un formato JSON válido.');
            return;
        }

        const body = repeaterBodyTextarea.value;

        // Mostrar Loader
        repeaterLoader.style.display = 'flex';
        repeaterResHeaders.textContent = '';
        repeaterResBody.textContent = '';
        repeaterResStatus.style.display = 'none';

        try {
            const res = await fetch('/api/repeater/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ method, url, headers, body })
            });
            
            const data = await res.json();
            
            if (data.status === 'ok') {
                const response = data.response;
                
                // Mostrar estatus
                repeaterResStatus.style.display = 'inline-block';
                repeaterResStatus.textContent = `${response.status_code} ${response.reason_phrase}`;
                
                // Color de estatus
                if (response.status_code >= 200 && response.status_code < 300) {
                    repeaterResStatus.style.backgroundColor = 'var(--success)';
                } else if (response.status_code >= 300 && response.status_code < 400) {
                    repeaterResStatus.style.backgroundColor = 'var(--secondary)';
                } else {
                    repeaterResStatus.style.backgroundColor = 'var(--danger)';
                }

                // Mostrar headers
                repeaterResHeaders.textContent = Object.entries(response.headers)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join('\n');
                
                // Mostrar cuerpo
                repeaterResBody.textContent = response.body;

                // Forzar ir a la subpestaña de Cuerpo de la respuesta
                const subtabResBody = document.querySelector('[data-subtab="rep-res-body"]');
                subtabResBody.click();
            } else {
                repeaterResHeaders.textContent = 'Error al enviar petición.';
                repeaterResBody.textContent = data.message || 'Error desconocido.';
            }
        } catch (error) {
            repeaterResHeaders.textContent = 'Error de red.';
            repeaterResBody.textContent = error.message;
        } finally {
            repeaterLoader.style.display = 'none';
        }
    });

    // Iniciar con valores por defecto en Repeater
    repeaterHeadersTextarea.value = JSON.stringify({
        "User-Agent": "AetherProxy/1.0",
        "Accept": "*/*",
        "Content-Type": "application/json"
    }, null, 2);
});

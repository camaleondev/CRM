const API_BASE_URL = 'http://127.0.0.1:8000';

// == UI & Navigation Logic ==
document.addEventListener('DOMContentLoaded', () => {
    // Nav links setup
    const navLinks = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            window.goToView(targetId);
        });
    });

    // Forms submission setup
    document.getElementById('form-client').addEventListener('submit', handleClientSubmit);
    document.getElementById('form-inventory').addEventListener('submit', handleInventorySubmit);
    document.getElementById('form-order').addEventListener('submit', handleOrderSubmit);

    // Initial data load for dashboard
    updateDashboard();

    // Actualización en tiempo real del Dashboard (Polling cada 3 segundos)
    setInterval(() => {
        updateDashboard();
    }, 3000);
});

window.goToView = function(targetId) {
    const navLinks = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    
    // Actualizar nav active states
    navLinks.forEach(l => {
        l.classList.remove('active');
        if (l.getAttribute('data-target') === targetId) {
            l.classList.add('active');
        }
    });

    // Mostrar el view
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');

    // Refrescar datos
    if (targetId === 'clients-view') fetchClients();
    else if (targetId === 'inventory-view') fetchInventory();
    else if (targetId === 'orders-view') fetchOrders();
    else if (targetId === 'dashboard-view') updateDashboard();
}

// Modals
window.openModal = function(id) {
    document.getElementById(id).classList.add('active');
}

window.closeModal = function(id) {
    document.getElementById(id).classList.remove('active');
}

window.openNewInventory = function() {
    currentEditInventoryId = null;
    document.getElementById('form-inventory').reset();
    document.getElementById('inventory-modal-title').innerText = "Añadir Pieza al Stock 🧩";
    document.getElementById('inventory-modal-btn').innerText = "Añadir al Inventario 💾";
    openModal('inventory-modal');
}

window.openNewClient = function() {
    currentEditClientId = null;
    document.getElementById('form-client').reset();
    document.getElementById('client-modal-title').innerText = "Añadir Nuevo Cliente 👤";
    document.getElementById('client-modal-btn').innerText = "Guardar Cliente 💾";
    openModal('client-modal');
}

// == Data Fetching & Rendering ==

// --- Dashboard ---
async function updateDashboard() {
    try {
        const clientsRes = await fetch(`${API_BASE_URL}/clients/`);
        const inventoryRes = await fetch(`${API_BASE_URL}/inventory/`);
        const ordersRes = await fetch(`${API_BASE_URL}/orders/`);

        const clients = await clientsRes.json();
        const inventory = await inventoryRes.json();
        const orders = await ordersRes.json();

        document.getElementById('stat-clients').innerText = clients.length || 0;
        document.getElementById('stat-inventory').innerText = inventory.length || 0;
        
        const completed = orders.filter(o => o.status === 'Completado ✅').length;
        const pending = orders.filter(o => o.status !== 'Completado ✅').length;

        document.getElementById('stat-completed-orders').innerText = completed || 0;
        document.getElementById('stat-pending-orders').innerText = pending || 0;
    } catch (e) {
        console.error("Error loading dashboard", e);
    }
}

// --- Clients ---
let globalClients = [];
let currentEditClientId = null;

async function fetchClients() {
    try {
        const res = await fetch(`${API_BASE_URL}/clients/`);
        globalClients = await res.json();
        const tbody = document.getElementById('clients-table-body');
        tbody.innerHTML = '';
        
        globalClients.forEach(client => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${client.id}</td>
                <td><strong>${client.name}</strong></td>
                <td>${client.phone || '-'}</td>
                <td>${client.email}</td>
                <td>
                    <button class="btn-secondary btn-small" onclick="openEditClient(${client.id})">✏️</button>
                    <button class="btn-danger btn-small" onclick="deleteClient(${client.id})">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error(e);
    }
}

async function handleClientSubmit(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('client-name').value,
        email: document.getElementById('client-email').value,
        phone: document.getElementById('client-phone').value,
        address: document.getElementById('client-address').value
    };

    try {
        let res;
        if (currentEditClientId) {
            res = await fetch(`${API_BASE_URL}/clients/${currentEditClientId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/clients/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (res.ok) {
            closeModal('client-modal');
            document.getElementById('form-client').reset();
            currentEditClientId = null;
            fetchClients();
            updateDashboard();
        } else alert("Error al guardar cliente");
    } catch (e) { console.error(e); }
}

window.openEditClient = function(id) {
    const client = globalClients.find(c => c.id === id);
    if (!client) return;

    currentEditClientId = id;
    document.getElementById('client-name').value = client.name;
    document.getElementById('client-email').value = client.email;
    document.getElementById('client-phone').value = client.phone || '';
    document.getElementById('client-address').value = client.address || '';

    document.getElementById('client-modal-title').innerText = "Editar Cliente 👤";
    document.getElementById('client-modal-btn').innerText = "Guardar Cambios 💾";
    
    openModal('client-modal');
}

async function deleteClient(id) {
    if (!confirm("¿Seguro que deseas eliminar el cliente?")) return;
    await fetch(`${API_BASE_URL}/clients/${id}`, { method: 'DELETE' });
    fetchClients();
}

// --- Inventory ---
let globalInventory = [];
let currentEditInventoryId = null;

async function fetchInventory() {
    try {
        const res = await fetch(`${API_BASE_URL}/inventory/`);
        globalInventory = await res.json();
        const grid = document.getElementById('inventory-grid');
        grid.innerHTML = '';
        
        globalInventory.forEach(item => {
            let stockClass = item.stock > 5 ? 'stock-high' : (item.stock > 0 ? 'stock-low' : 'stock-out');
            let stockText = item.stock > 0 ? `${item.stock} en stock` : 'Agotado';

            const card = document.createElement('div');
            card.className = 'inv-card glass-card';
            card.innerHTML = `
                <div class="inv-emoji">${item.emoji || '📦'}</div>
                <div class="inv-name">${item.name}</div>
                <div class="inv-price">$${item.price.toFixed(2)}</div>
                <div class="stock-badge ${stockClass}">${stockText}</div>
                <div style="margin-top: 15px; display: flex; justify-content: center; gap: 8px;">
                    <button class="btn-secondary btn-small" onclick="openEditInventory(${item.id})">✏️</button>
                    <button class="btn-danger btn-small" onclick="deleteInventory(${item.id})">🗑️</button>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

async function handleInventorySubmit(e) {
    e.preventDefault();
    const payload = {
        name: document.getElementById('inv-name').value,
        emoji: document.getElementById('inv-emoji').value,
        category: document.getElementById('inv-category').value,
        stock: parseInt(document.getElementById('inv-stock').value),
        price: parseFloat(document.getElementById('inv-price').value)
    };

    try {
        let res;
        if (currentEditInventoryId) {
            res = await fetch(`${API_BASE_URL}/inventory/${currentEditInventoryId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/inventory/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            closeModal('inventory-modal');
            document.getElementById('form-inventory').reset();
            currentEditInventoryId = null;
            fetchInventory();
            updateDashboard();
        }
    } catch (e) { console.error(e); }
}

window.openEditInventory = function(id) {
    const item = globalInventory.find(i => i.id === id);
    if (!item) return;

    currentEditInventoryId = id;
    document.getElementById('inv-name').value = item.name;
    document.getElementById('inv-emoji').value = item.emoji;
    document.getElementById('inv-category').value = item.category;
    document.getElementById('inv-stock').value = item.stock;
    document.getElementById('inv-price').value = item.price;

    document.getElementById('inventory-modal-title').innerText = "Editar Pieza 🧩";
    document.getElementById('inventory-modal-btn').innerText = "Guardar Cambios 💾";
    
    openModal('inventory-modal');
}

async function deleteInventory(id) {
    if (!confirm("¿Eliminar pieza de inventario?")) return;
    await fetch(`${API_BASE_URL}/inventory/${id}`, { method: 'DELETE' });
    fetchInventory();
}

// --- Orders ---
let availableItems = [];
let globalOrders = [];
let currentEditOrderId = null;

window.openNewOrder = async function() {
    currentEditOrderId = null;
    document.getElementById('form-order').reset();
    document.getElementById('selected-parts-list').innerHTML = '';
    document.getElementById('order-modal-title').innerText = "Crear Orden de Reparación 🔧";
    document.getElementById('order-modal-btn').innerText = "Crear Orden y Descartar Stock 🛠️";
    await populateOrderForm();
    openModal('order-modal');
}

window.openEditOrder = async function(id) {
    const order = globalOrders.find(o => o.id === id);
    if (!order) return;
    
    currentEditOrderId = id;
    document.getElementById('form-order').reset();
    document.getElementById('selected-parts-list').innerHTML = '';
    
    await populateOrderForm();
    
    document.getElementById('order-modal-title').innerText = `Editar Orden #${order.id} 🔧`;
    document.getElementById('order-modal-btn').innerText = "Guardar Cambios 💾";
    
    document.getElementById('order-client').value = order.client_id;
    document.getElementById('order-device').value = order.device;
    document.getElementById('order-description').value = order.description;
    
    order.items.forEach(orderItem => {
        addPartRow();
        const rows = document.querySelectorAll('#selected-parts-list .part-row');
        const lastRow = rows[rows.length - 1];
        
        const select = lastRow.querySelector('.part-select');
        const qty = lastRow.querySelector('.part-qty');
        
        let foundOption = select.querySelector(`option[value="${orderItem.item_id}"]`);
        
        if (foundOption) {
            const currentStock = parseInt(foundOption.getAttribute('data-max'));
            const maxStock = currentStock + orderItem.quantity;
            foundOption.setAttribute('data-max', maxStock);
            foundOption.innerText = foundOption.innerText.replace(`Stock: ${currentStock}`, `Stock: ${maxStock}`);
            
            select.value = orderItem.item_id;
            qty.disabled = false;
            qty.max = maxStock;
            qty.value = orderItem.quantity;
        } else if (orderItem.item) {
            const maxStock = orderItem.item.stock + orderItem.quantity;
            const newOption = `<option value="${orderItem.item_id}" data-max="${maxStock}">${orderItem.item.emoji} ${orderItem.item.name} ($${orderItem.item.price}) - Stock: ${maxStock}</option>`;
            select.innerHTML += newOption;
            select.value = orderItem.item_id;
            qty.disabled = false;
            qty.max = maxStock;
            qty.value = orderItem.quantity;
        }
    });

    openModal('order-modal');
}

async function populateOrderForm() {
    const clRes = await fetch(`${API_BASE_URL}/clients/`);
    const invRes = await fetch(`${API_BASE_URL}/inventory/`);
    
    const clients = await clRes.json();
    availableItems = await invRes.json();

    const clientSelect = document.getElementById('order-client');
    clientSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
    clients.forEach(c => {
        clientSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
    });

    // Reset parts list explicitly
    document.getElementById('selected-parts-list').innerHTML = '';
}

window.addPartRow = function() {
    const container = document.getElementById('selected-parts-list');
    const row = document.createElement('div');
    row.className = 'part-row';

    let options = '<option value="">Selecciona repuesto...</option>';
    availableItems.forEach(i => {
        if (i.stock > 0) {
            options += `<option value="${i.id}" data-max="${i.stock}">${i.emoji} ${i.name} ($${i.price}) - Stock: ${i.stock}</option>`;
        }
    });

    row.innerHTML = `
        <select class="part-select flex-3" onchange="updateMaxQty(this)" required>${options}</select>
        <input type="number" class="part-qty flex-1" value="1" min="1" required disabled>
        <button type="button" class="btn-danger btn-small" onclick="this.parentElement.remove()">✖️</button>
    `;
    container.appendChild(row);
}

window.updateMaxQty = function(selectElem) {
    const qtyInput = selectElem.parentElement.querySelector('.part-qty');
    const selectedOption = selectElem.options[selectElem.selectedIndex];
    
    if (selectElem.value) {
        qtyInput.disabled = false;
        qtyInput.max = selectedOption.getAttribute('data-max');
        if (parseInt(qtyInput.value) > parseInt(qtyInput.max)) {
            qtyInput.value = qtyInput.max;
        }
    } else {
        qtyInput.disabled = true;
        qtyInput.value = 1;
    }
}

async function fetchOrders() {
    try {
        const res = await fetch(`${API_BASE_URL}/orders/`);
        globalOrders = await res.json();
        const list = document.getElementById('orders-list');
        list.innerHTML = '';
        
        globalOrders.forEach(order => {
            let bgColor = 'rgba(255,255,255,0.05)';
            if (order.status.includes('✅')) bgColor = 'rgba(104, 211, 145, 0.1)';
            if (order.status.includes('⏳')) bgColor = 'rgba(246, 173, 85, 0.1)';
            if (order.status.includes('🛠️')) bgColor = 'rgba(99, 179, 237, 0.1)';

            const card = document.createElement('div');
            card.className = 'order-card glass-card';
            card.style.background = bgColor;
            
            card.innerHTML = `
                <div class="order-main-info">
                    <span class="order-client">👤 Cliente #${order.client_id} - <strong>${order.client ? order.client.name : 'Desc'}</strong></span>
                    <span class="order-device">📱 ${order.device}</span>
                    <p style="font-size:0.9rem; color:var(--text-secondary)">${order.description}</p>
                </div>
                <div style="display:flex; gap: 1rem; align-items:center; flex-wrap:wrap;">
                    <button class="btn-primary btn-small" onclick="viewOrderDetails(${order.id})">🔍 Detalle</button>
                    <button class="btn-secondary btn-small" onclick="openEditOrder(${order.id})">✏️ Editar</button>
                    <div class="order-status">${order.status}</div>
                    <select class="btn-secondary" onchange="updateOrderStatus(${order.id}, this.value)">
                        <option value="Pendiente ⏳" ${order.status.includes('⏳')?'selected':''}>Pendiente</option>
                        <option value="En Progreso 🛠️" ${order.status.includes('🛠️')?'selected':''}>En Progreso</option>
                        <option value="Completado ✅" ${order.status.includes('✅')?'selected':''}>Completado</option>
                    </select>
                    <button class="btn-danger" onclick="deleteOrder(${order.id})">🗑️</button>
                </div>
            `;
            list.appendChild(card);
        });
    } catch (e) {
        console.error(e);
    }
}

window.viewOrderDetails = function(id) {
    const order = globalOrders.find(o => o.id === id);
    if (!order) return;

    let itemsHtml = '';
    let totalItemsCost = 0;

    if (order.items && order.items.length > 0) {
        itemsHtml = `<div class="table-container" style="margin-top: 10px;">
        <table class="glass-table" style="font-size: 0.9rem;">
            <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio U.</th><th>Subtotal</th></tr></thead>
            <tbody>`;
        order.items.forEach(orderItem => {
            const itemObj = orderItem.item || { emoji: '❓', name: 'Repuesto Eliminado', price: 0 };
            const subtotal = orderItem.quantity * itemObj.price;
            totalItemsCost += subtotal;
            itemsHtml += `<tr>
                <td>${itemObj.emoji} ${itemObj.name}</td>
                <td>${orderItem.quantity}</td>
                <td>$${itemObj.price.toFixed(2)}</td>
                <td>$${subtotal.toFixed(2)}</td>
            </tr>`;
        });
        itemsHtml += `</tbody></table></div>`;
    } else {
        itemsHtml = `<p style="color:var(--text-secondary)">No se utilizaron repuestos en esta orden.</p>`;
    }

    document.getElementById('detail-title').innerText = `Orden #${order.id} - ${order.status}`;
    
    document.getElementById('detail-content').innerHTML = `
        <div class="detail-section">
            <h3>👤 Información del Cliente</h3>
            <p><strong>Nombre:</strong> ${order.client.name}</p>
            <p><strong>Email:</strong> ${order.client.email}</p>
            <p><strong>Tel/Dir:</strong> ${order.client.phone || 'N/D'} | ${order.client.address || 'N/D'}</p>
        </div>
        <div class="detail-section">
            <h3>📱 Detalles del Dispositivo</h3>
            <p><strong>Dispositivo:</strong> ${order.device}</p>
            <p><strong>Falla documentada:</strong> ${order.description}</p>
        </div>
        <div class="detail-section">
            <h3>🧩 Repuestos Asignados</h3>
            ${itemsHtml}
        </div>
        <div class="order-total">
            Total Repuestos: $${totalItemsCost.toFixed(2)}
        </div>
    `;

    openModal('order-detail-modal');

    // Manejar exportación a PDF
    document.getElementById('btn-export-pdf').onclick = function() {
        const sourceElement = document.getElementById('detail-content');
        
        // Crear contenedor temporal para garantizar el fondo oscuro en el PDF
        // dado que originariamente se usaban fondos transparentes/glassmorphism
        const pdfContainer = document.createElement('div');
        pdfContainer.style.padding = '30px';
        pdfContainer.style.backgroundColor = '#0f1016';
        pdfContainer.style.color = '#ffffff';
        pdfContainer.style.fontFamily = 'Outfit, sans-serif';
        
        // Cabecera del PDF
        pdfContainer.innerHTML = `
            <div style="border-bottom: 2px solid #4facfe; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #4facfe; margin: 0;">🛠️ TechFix CRM</h1>
                <h2 style="color: #ffffff; margin: 5px 0 0 0;">Reporte de Orden de Servicio #${order.id}</h2>
                <p style="color: #a0aec0; margin: 5px 0 0 0;">Estado: ${order.status}</p>
            </div>
        `;
        
        pdfContainer.innerHTML += sourceElement.innerHTML;

        const opt = {
            margin:       0.5,
            filename:     `Orden_${order.id}_${order.client.name.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0f1016' },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(pdfContainer).save();
    };
}

window.updateOrderStatus = async function(id, newStatus) {
    try {
        await fetch(`${API_BASE_URL}/orders/${id}/status?status=${newStatus}`, { method: 'PUT' });
        fetchOrders();
    } catch (e) { console.error(e); }
}

async function handleOrderSubmit(e) {
    e.preventDefault();
    
    const client_id = parseInt(document.getElementById('order-client').value);
    const device = document.getElementById('order-device').value;
    const description = document.getElementById('order-description').value;
    
    // Gather parts
    const partsSelects = document.querySelectorAll('.part-select');
    const partsQtys = document.querySelectorAll('.part-qty');
    const items = [];
    
    for (let i = 0; i < partsSelects.length; i++) {
        if (partsSelects[i].value) {
            items.push({
                item_id: parseInt(partsSelects[i].value),
                quantity: parseInt(partsQtys[i].value)
            });
        }
    }

    const payload = {
        client_id,
        device,
        description,
        items
    };

    try {
        let res;
        if (currentEditOrderId) {
            res = await fetch(`${API_BASE_URL}/orders/${currentEditOrderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/orders/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            closeModal('order-modal');
            document.getElementById('form-order').reset();
            document.getElementById('selected-parts-list').innerHTML = '';
            currentEditOrderId = null;
            fetchOrders();
            updateDashboard();
        } else {
            const errorData = await res.json();
            alert(`Error al guardar la orden:\n${errorData.detail || "Ha ocurrido un problema desconocido."}`);
        }
    } catch (e) { 
        console.error(e);
        alert("Error de conexión al guardar la orden.");
    }
}

async function deleteOrder(id) {
    if (!confirm("¿Eliminar esta orden de reparación?")) return;
    await fetch(`${API_BASE_URL}/orders/${id}`, { method: 'DELETE' });
    fetchOrders();
}

// --- AUTENTICACIÓN Y USUARIOS ---
let currentUser = null;
let currentToken = null;

// Guardar y recuperar token del localStorage
function saveToken(token, user) {
    currentToken = token;
    currentUser = user;
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    updateUIForUserRole();
}

function loadToken() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        updateUIForUserRole();
        return true;
    }
    return false;
}

function logout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    location.reload();
}

// Actualizar UI según rol del usuario
function updateUIForUserRole() {
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    const userNameEl = document.querySelector('.user-info .name');
    const userRoleEl = document.querySelector('.user-info .role');
    
    if (currentUser) {
        if (userNameEl) userNameEl.innerText = currentUser.username;
        if (userRoleEl) {
            userRoleEl.innerText = currentUser.role === 'admin' ? 'Administrador' : 'Técnico';
        }
        
        // Mostrar/ocultar elementos según rol
        adminOnlyElements.forEach(el => {
            el.style.display = currentUser.role === 'admin' ? 'list-item' : 'none';
        });
    }
}

async function handleLogin(username, password) {
    try {
        const res = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${username}&password=${password}`
        });
        
        if (res.ok) {
            const data = await res.json();
            saveToken(data.access_token, data.user);
            return true;
        } else {
            alert('Usuario o contraseña incorrectos');
            return false;
        }
    } catch (e) {
        console.error(e);
        alert('Error al conectar con el servidor');
        return false;
    }
}

// Headers con autenticación
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }
    return headers;
}

// Sobreescribir fetch para incluir token automáticamente
const originalFetch = fetch;
window.fetch = function(...args) {
    // Solo agregar autenticación a requests internos
    if (args[0].startsWith(API_BASE_URL) && args[1]) {
        if (!args[1].headers) args[1].headers = {};
        if (currentToken && !args[1].headers.Authorization) {
            args[1].headers.Authorization = `Bearer ${currentToken}`;
        }
    }
    return originalFetch.apply(this, args);
};

// --- GESTIÓN DE USUARIOS ---
let globalUsers = [];
let currentEditUserId = null;

async function fetchUsers() {
    try {
        const res = await fetch(`${API_BASE_URL}/users/`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('Error al obtener usuarios');
        
        globalUsers = await res.json();
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';
        
        globalUsers.forEach(user => {
            const tr = document.createElement('tr');
            const roleDisplay = user.role === 'admin' ? '👨‍💼 Administrador' : '👷 Técnico';
            tr.innerHTML = `
                <td>${user.id}</td>
                <td><strong>${user.username}</strong></td>
                <td>${user.email}</td>
                <td>${roleDisplay}</td>
                <td>${user.is_active ? '✅ Activo' : '❌ Inactivo'}</td>
                <td>
                    <button class="btn-secondary btn-small" onclick="openChangeRoleModal(${user.id}, '${user.username}', '${user.role}')">🔄 Cambiar Rol</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Error cargando usuarios:', e);
        alert('Error al cargar usuarios');
    }
}

window.openNewUserModal = function() {
    currentEditUserId = null;
    document.getElementById('form-user').reset();
    document.getElementById('user-modal-title').innerText = "Crear Nuevo Usuario 👤";
    document.getElementById('user-modal-btn').innerText = "Crear Usuario 💾";
    openModal('user-modal');
}

window.openChangeRoleModal = function(userId, username, currentRole) {
    currentEditUserId = userId;
    document.getElementById('change-role-user-label').innerText = `Usuario: ${username}`;
    document.getElementById('change-role-select').value = currentRole;
    openModal('change-role-modal');
}

async function handleUserSubmit(e) {
    e.preventDefault();
    const payload = {
        username: document.getElementById('user-username').value,
        email: document.getElementById('user-email').value,
        password: document.getElementById('user-password').value
    };

    try {
        const res = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal('user-modal');
            document.getElementById('form-user').reset();
            fetchUsers();
            alert('✅ Usuario creado exitosamente');
        } else {
            const error = await res.json();
            alert(`❌ Error: ${error.detail || 'No se pudo crear el usuario'}`);
        }
    } catch (e) { 
        console.error(e);
        alert('Error al crear usuario');
    }
}

async function handleChangeRoleSubmit(e) {
    e.preventDefault();
    const newRole = document.getElementById('change-role-select').value;

    try {
        const res = await fetch(`${API_BASE_URL}/users/${currentEditUserId}/role`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ role: newRole })
        });

        if (res.ok) {
            closeModal('change-role-modal');
            fetchUsers();
            alert('✅ Rol actualizado exitosamente');
        } else {
            const error = await res.json();
            alert(`❌ Error: ${error.detail || 'No se pudo cambiar el rol'}`);
        }
    } catch (e) { 
        console.error(e);
        alert('Error al cambiar rol');
    }
}

// Inicialización con autenticación
document.addEventListener('DOMContentLoaded', () => {
    // Cargar token al iniciar
    if (loadToken()) {
        // Si hay token, cargar datos normalmente
        document.getElementById('form-client').addEventListener('submit', handleClientSubmit);
        document.getElementById('form-inventory').addEventListener('submit', handleInventorySubmit);
        document.getElementById('form-order').addEventListener('submit', handleOrderSubmit);
        document.getElementById('form-user').addEventListener('submit', handleUserSubmit);
        document.getElementById('form-change-role').addEventListener('submit', handleChangeRoleSubmit);
        
        updateDashboard();
        setInterval(() => { updateDashboard(); }, 3000);
    } else {
        // Si no hay token, mostrar login
        showLoginScreen();
    }
});

function showLoginScreen() {
    const appContent = document.getElementById('app-content');
    appContent.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
            <div class="glass-card" style="width: 100%; max-width: 400px; padding: 2rem;">
                <h2 style="text-align: center; margin-bottom: 2rem;">🔐 Iniciar Sesión</h2>
                <form id="login-form" onsubmit="handleLoginSubmit(event)">
                    <div class="form-group">
                        <label>Usuario</label>
                        <input type="text" id="login-username" required placeholder="admin" />
                    </div>
                    <div class="form-group">
                        <label>Contraseña</label>
                        <input type="password" id="login-password" required placeholder="admin123" />
                    </div>
                    <button type="submit" class="btn-primary w-100">Ingresar 🚀</button>
                </form>
                <p style="text-align: center; margin-top: 1rem; color: var(--text-secondary); font-size: 0.85rem;">
                    ℹ️ Credenciales por defecto: admin / admin123
                </p>
            </div>
        </div>
    `;
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginForm();
    });
}

async function handleLoginForm() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (await handleLogin(username, password)) {
        location.reload();
    }
}

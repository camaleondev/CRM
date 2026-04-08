// Usar origin vacío para que las llamadas se hagan al mismo host donde se sirve
// la app en producción (Heroku). Durante desarrollo local puedes cambiar
// esta constante a 'http://127.0.0.1:8000' si ejecutas el backend localmente.
const API_BASE_URL = '';

function formatError(err) {
    if (!err) return 'Ha ocurrido un error.';
    if (typeof err === 'string') return err;
    if (err.detail) {
        if (typeof err.detail === 'string') return err.detail;
        if (Array.isArray(err.detail)) return err.detail.map(d => (d.msg || JSON.stringify(d))).join('\n');
        try { return JSON.stringify(err.detail); } catch (e) { return String(err.detail); }
    }
    try { return JSON.stringify(err); } catch (e) { return String(err); }
}

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

    // Delegated handler for payment buttons (works even for dynamic content)
    document.addEventListener('click', (e) => {
        try {
            if (e.defaultPrevented) return; // respeta handlers que detuvieron la propagación
            const btn = e.target.closest && e.target.closest('.btn-payment');
            if (!btn) return;
            const id = parseInt(btn.getAttribute('data-order-id'));
            if (isNaN(id)) {
                console.warn('Pago: order id inválido en botón', btn);
                return;
            }
            console.log('delegated btn-payment click, orderId=', id, btn);
            openPaymentModal(id);
        } catch (err) {
            console.error('Error en handler delegado btn-payment', err);
        }
    });

    // Forms submission setup
    document.getElementById('form-client').addEventListener('submit', handleClientSubmit);
    document.getElementById('form-inventory').addEventListener('submit', handleInventorySubmit);
    document.getElementById('form-order').addEventListener('submit', handleOrderSubmit);
    document.getElementById('form-accounting').addEventListener('submit', handleAccountingSubmit);
    const formPayment = document.getElementById('form-payment');
    if (formPayment) formPayment.addEventListener('submit', handlePaymentSubmit);
    document.getElementById('change-password-form').addEventListener('submit', handlePasswordChange);

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
    else if (targetId === 'accounting-view') fetchAccounting();
    else if (targetId === 'dashboard-view') updateDashboard();
    else if (targetId === 'profile-view') fetchProfile();
}

// Modals
window.openModal = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    // Forzar display por si la hoja de estilos no aplica correctamente
    try { el.style.display = 'flex'; } catch (e) {}
}

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('active');
    try { el.style.display = 'none'; } catch (e) {}
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
        const clientsRes = await fetch(`${API_BASE_URL}/clients/`, {
            headers: getAuthHeaders()
        });
        const inventoryRes = await fetch(`${API_BASE_URL}/inventory/`, {
            headers: getAuthHeaders()
        });
        const ordersRes = await fetch(`${API_BASE_URL}/orders/`, {
            headers: getAuthHeaders()
        });

        const clients = await clientsRes.json();
        const inventory = await inventoryRes.json();
        const orders = await ordersRes.json();

    document.getElementById('stat-clients').innerText = clients.length || 0;
        document.getElementById('stat-inventory').innerText = inventory.length || 0;
        
        const completed = orders.filter(o => o.status === 'Completado ✅').length;
        const pending = orders.filter(o => o.status !== 'Completado ✅').length;

        document.getElementById('stat-completed-orders').innerText = completed || 0;
        document.getElementById('stat-pending-orders').innerText = pending || 0;

        const accountingRes = await fetch(`${API_BASE_URL}/accounting/`, {
            headers: getAuthHeaders()
        });
        if (accountingRes.ok) {
            const accounting = await accountingRes.json();
            let income = 0;
            let expense = 0;
            accounting.forEach(entry => {
                if (entry.entry_type === 'income') income += entry.amount;
                else if (entry.entry_type === 'expense') expense += entry.amount;
            });
            document.getElementById('dashboard-income').innerText = `$${income.toFixed(2)}`;
            document.getElementById('dashboard-expense').innerText = `$${expense.toFixed(2)}`;
            document.getElementById('dashboard-profit').innerText = `$${(income - expense).toFixed(2)}`;
        }
    } catch (e) {
        console.error("Error loading dashboard", e);
    }
}

// --- Profile ---
async function fetchProfile() {
    try {
        const res = await fetch(`${API_BASE_URL}/me`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const user = await res.json();
        
        document.getElementById('profile-username').innerText = user.username;
        document.getElementById('profile-email').innerText = user.email;
        document.getElementById('profile-role').innerText = user.role === 'admin' ? 'Administrador' : 'Técnico';
    } catch (e) {
        console.error("Error loading profile", e);
    }
}

async function handlePasswordChange(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        alert('Las contraseñas nuevas no coinciden');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/me/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        if (res.ok) {
            alert('Contraseña cambiada exitosamente');
            document.getElementById('change-password-form').reset();
        } else {
            const error = await res.json();
            alert('Error: ' + error.detail);
        }
    } catch (e) {
        console.error(e);
        alert('Error al cambiar la contraseña');
    }
}

// --- Clients ---
let globalClients = [];
let currentEditClientId = null;

async function fetchClients() {
    try {
        const res = await fetch(`${API_BASE_URL}/clients/`, {
            headers: getAuthHeaders()
        });
        globalClients = await res.json();
        const tbody = document.getElementById('clients-table-body');
        tbody.innerHTML = '';
        
        globalClients.forEach(client => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${client.id}</td>
                <td><strong>${client.name}</strong></td>
                <td>${client.id_type || '-'}</td>
                <td>${client.id_number || '-'}</td>
                <td>${client.phone || '-'}</td>
                <td>${client.email}</td>
                <td>
                    ${currentUser.role === 'admin' ? `<button class="btn-secondary btn-small" onclick="openEditClient(${client.id})">✏️</button>` : ''}
                    ${currentUser.role === 'admin' ? `<button class="btn-danger btn-small" onclick="deleteClient(${client.id})">🗑️</button>` : ''}
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
        address: document.getElementById('client-address').value,
        id_type: document.getElementById('client-id-type').value || null,
        id_number: document.getElementById('client-id-number').value || null
    };

    try {
        let res;
        if (currentEditClientId) {
            res = await fetch(`${API_BASE_URL}/clients/${currentEditClientId}`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/clients/`, {
                method: 'POST',
                headers: getAuthHeaders(),
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
    document.getElementById('client-id-type').value = client.id_type || '';
    document.getElementById('client-id-number').value = client.id_number || '';

    document.getElementById('client-modal-title').innerText = "Editar Cliente 👤";
    document.getElementById('client-modal-btn').innerText = "Guardar Cambios 💾";
    
    openModal('client-modal');
}

async function deleteClient(id) {
    if (!confirm("¿Seguro que deseas eliminar el cliente?")) return;
    await fetch(`${API_BASE_URL}/clients/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    fetchClients();
}

// --- Inventory ---
let globalInventory = [];
let currentEditInventoryId = null;

async function fetchInventory() {
    try {
        const res = await fetch(`${API_BASE_URL}/inventory/`, {
            headers: getAuthHeaders()
        });
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
                    ${currentUser.role === 'admin' ? `<button class="btn-secondary btn-small" onclick="openEditInventory(${item.id})">✏️</button>` : ''}
                    ${currentUser.role === 'admin' ? `<button class="btn-danger btn-small" onclick="deleteInventory(${item.id})">🗑️</button>` : ''}
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
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/inventory/`, {
                method: 'POST',
                headers: getAuthHeaders(),
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
    await fetch(`${API_BASE_URL}/inventory/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    fetchInventory();
}

// --- Orders ---
let availableItems = [];
let globalOrders = [];
let currentEditOrderId = null;
let currentPaymentOrderId = null;
let currentOrderDueAmount = 0;

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
        const res = await fetch(`${API_BASE_URL}/orders/`, {
            headers: getAuthHeaders()
        });
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
                    <button class="btn-secondary btn-small btn-payment" data-order-id="${order.id}">💳 Pago</button>
                    ${currentUser.role === 'admin' ? `<button class="btn-secondary btn-small" onclick="openEditOrder(${order.id})">✏️ Editar</button>` : ''}
                    <div class="order-status">${order.status}</div>
                    <select class="btn-secondary" onchange="updateOrderStatus(${order.id}, this.value)">
                        <option value="Pendiente ⏳" ${order.status.includes('⏳')?'selected':''}>Pendiente</option>
                        <option value="En Progreso 🛠️" ${order.status.includes('🛠️')?'selected':''}>En Progreso</option>
                        <option value="Completado ✅" ${order.status.includes('✅')?'selected':''}>Completado</option>
                    </select>
                    ${currentUser.role === 'admin' ? `<button class="btn-danger" onclick="deleteOrder(${order.id})">🗑️</button>` : ''}
                </div>
            `;
            list.appendChild(card);
        });

        // Attach payment button handlers after rendering
        document.querySelectorAll('.btn-payment').forEach(btn => {
            btn.removeEventListener('click', btn._paymentHandler);
            const handler = (e) => {
                // Evitar que el delegado también capture este click
                e.stopPropagation();
                const id = parseInt(btn.getAttribute('data-order-id'));
                console.log('attached btn-payment handler invoked, orderId=', id, btn);
                if (!isNaN(id)) openPaymentModal(id);
            };
            btn._paymentHandler = handler;
            btn.addEventListener('click', handler);
        });
    } catch (e) {
        console.error(e);
    }
}

async function fetchAccounting() {
    try {
        const res = await fetch(`${API_BASE_URL}/accounting/`, {
            headers: getAuthHeaders()
        });
        const entries = await res.json();
        const tbody = document.getElementById('accounting-table-body');
        tbody.innerHTML = '';

        let income = 0;
        let expense = 0;

        entries.forEach(entry => {
            const amount = parseFloat(entry.amount || 0);
            if (entry.entry_type === 'income') income += amount;
            else if (entry.entry_type === 'expense') expense += amount;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${entry.id}</td>
                <td>${entry.entry_type === 'income' ? 'Ingreso' : 'Gasto'}</td>
                <td>${entry.category}</td>
                <td>${entry.description || '-'}</td>
                <td>${entry.entry_type === 'income' ? '+' : '-'}$${amount.toFixed(2)}</td>
                <td>${new Date(entry.created_at).toLocaleString()}</td>
                <td>${currentUser && currentUser.role === 'admin' ? `<button class="btn-danger btn-small" onclick="deleteAccountingEntry(${entry.id})">🗑️</button>` : ''}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('stat-income').innerText = `$${income.toFixed(2)}`;
        document.getElementById('stat-expense').innerText = `$${expense.toFixed(2)}`;
        document.getElementById('stat-profit').innerText = `$${(income - expense).toFixed(2)}`;
    } catch (e) {
        console.error('Error loading accounting', e);
    }
}

window.openNewAccountingEntry = function() {
    document.getElementById('form-accounting').reset();
    document.getElementById('accounting-modal-title').innerText = 'Registrar Movimiento Contable 💼';
    openModal('accounting-modal');
}

async function handleAccountingSubmit(e) {
    e.preventDefault();
    const payload = {
        entry_type: document.getElementById('accounting-type').value,
        category: document.getElementById('accounting-category').value,
        amount: parseFloat(document.getElementById('accounting-amount').value),
        description: document.getElementById('accounting-description').value
    };

    try {
        const res = await fetch(`${API_BASE_URL}/accounting/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            closeModal('accounting-modal');
            fetchAccounting();
        } else {
            const errorData = await res.json();
            alert(`Error al guardar registro contable:\n${formatError(errorData) || 'Ha ocurrido un problema.'}`);
        }
    } catch (e) {
        console.error(e);
        alert('Error al conectar con la API');
    }
}

async function deleteAccountingEntry(id) {
    if (!confirm('¿Eliminar este registro contable?')) return;
    await fetch(`${API_BASE_URL}/accounting/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
    });
    fetchAccounting();
}

window.viewOrderDetails = async function(id) {
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
    
    let payments = [];
    try {
        const paymentRes = await fetch(`${API_BASE_URL}/payments/order/${order.id}`, { headers: getAuthHeaders() });
        if (paymentRes.ok) payments = await paymentRes.json();
    } catch (e) {
        console.error('Error loading payments for order', e);
    }

    let paymentsHtml = '<p style="color:var(--text-secondary)">No hay pagos registrados para esta orden.</p>';
    if (payments.length > 0) {
        paymentsHtml = `<div class="table-container" style="margin-top: 10px;">
            <table class="glass-table" style="font-size: 0.9rem;">
                <thead><tr><th>ID Pago</th><th>Método</th><th>Estado</th><th>Monto</th><th>Transacción</th><th>Fecha</th></tr></thead>
                <tbody>`;
        payments.forEach(pay => {
            paymentsHtml += `<tr>
                <td>${pay.id}</td>
                <td>${pay.payment_method.replace('_', ' ')}</td>
                <td>${pay.status}</td>
                <td>$${parseFloat(pay.amount).toFixed(2)}</td>
                <td>${pay.transaction_id || '-'}</td>
                <td>${pay.paid_at ? new Date(pay.paid_at).toLocaleString() : '-'}</td>
            </tr>`;
        });
        paymentsHtml += '</tbody></table></div>';
    }

    document.getElementById('detail-content').innerHTML = `
        <div class="detail-section">
            <h3>👤 Información del Cliente</h3>
            <p><strong>Nombre:</strong> ${order.client.name}</p>
            <p><strong>Email:</strong> ${order.client.email}</p>
            <p><strong>Tel/Dir:</strong> ${order.client.phone || 'N/D'} | ${order.client.address || 'N/D'}</p>
            <p><strong>Documento:</strong> ${order.client.id_type ? (order.client.id_type + ' - ' + (order.client.id_number || '')) : 'N/D'}</p>
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
        <div class="detail-section">
            <h3>💳 Pagos</h3>
            ${paymentsHtml}
        </div>
    `;

    openModal('order-detail-modal');

    // Manejar exportación a PDF
    document.getElementById('btn-export-pdf').onclick = function() {
        const sourceElement = document.getElementById('detail-content');
        
        // Crear contenedor temporal para el PDF (fondo claro)
        const pdfContainer = document.createElement('div');
        pdfContainer.style.padding = '30px';
        pdfContainer.style.backgroundColor = '#ffffff';
        pdfContainer.style.color = '#111111';
        pdfContainer.style.fontFamily = 'Outfit, sans-serif';

        // Estilos inline para el PDF: texto negro y títulos en colores
        const pdfInlineStyles = `
            <style>
                /* Usar Courier New para el PDF */
                body{ background:#ffffff; color:#111111; font-family: 'Courier New', Courier, monospace; }
                p, td, th, li, span, div { color: #111111 !important; }
                h1 { color: #0077cc !important; }
                h2 { color: #4facfe !important; }
                h3 { color: #c471ed !important; }
                table { border-collapse: collapse; width: 100%; }
                th { color: #111111 !important; font-weight: 700; }
                .detail-section h3 { color: #c471ed !important; }
                /* Eliminar fondos grises y sombras en elementos tipo glass */
                .glass-card, .glass-table, .detail-section, .blob, .stat-card, .modal, .modal-overlay {
                    background: transparent !important;
                    box-shadow: none !important;
                    border: none !important;
                }
                /* Asegurar filas y celdas sin fondo */
                table tr, table td, table th { background: transparent !important; }
                .pdf-fit .detail-section { background: transparent !important; padding: 4px 0 !important; }
                /* Estilos compactos para intentar que todo quepa en una sola hoja */
                .pdf-fit { font-size: 12px; line-height: 1.15; }
                .pdf-fit h1 { font-size: 18px; }
                .pdf-fit h2 { font-size: 14px; }
                .pdf-fit h3 { font-size: 12px; }
                .pdf-fit .detail-section { margin-bottom: 6px; padding: 6px 0; }
                .pdf-fit table th, .pdf-fit table td { font-size: 11px; padding: 6px 8px; }
                .pdf-fit img { max-height: 48px; }
                    /* Mejor renderizado de texto */
                    html, body, .detail-content, .pdf-fit { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: geometricPrecision; }
            </style>
        `;
        
        // Cabecera del PDF con logo
        pdfContainer.innerHTML = pdfInlineStyles + `
            <div style="display:flex; align-items:center; gap:16px; border-bottom: 2px solid #4facfe; padding-bottom: 15px; margin-bottom: 20px;">
                <div style="flex:0 0 auto;">
                    <img src="assets/logo.png" alt="logo" style="height:64px; object-fit:contain; display:block;" onerror="this.style.display='none'">
                </div>
                <div style="flex:1 1 auto;">
                    <h1 style="color: #0077cc; margin: 0; font-size:20px;">🛠️ TechFix CRM</h1>
                    <h2 style="color: #111111; margin: 5px 0 0 0; font-size:16px;">Reporte de Orden de Servicio #${order.id}</h2>
                    <p style="color: #555555; margin: 5px 0 0 0;">Estado: ${order.status}</p>
                </div>
            </div>
        `;
        
        pdfContainer.innerHTML += sourceElement.innerHTML;

        // Calcular escala recomendada para html2canvas en función del devicePixelRatio
        const _dpr = (window && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        const _scale = Math.min(3, Math.max(1, _dpr * 2));

        const opt = {
            margin:       0.25,
            filename:     `Orden_${order.id}_${order.client.name.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'png', quality: 1.0 },
            html2canvas:  { scale: _scale, useCORS: true, backgroundColor: '#ffffff', logging: false, allowTaint: false },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css'], avoid: ['.detail-section'] }
        };

        // Añadir clases para reducir tamaño y espaciado y así intentar que quepa en una sola hoja
        pdfContainer.classList.add('pdf-fit');

        html2pdf().set(opt).from(pdfContainer).save().then(() => {
            pdfContainer.classList.remove('pdf-fit');
        }).catch(() => {
            // En caso de error, remover la clase para no afectar la UI
            pdfContainer.classList.remove('pdf-fit');
        });
    };
}

window.updateOrderStatus = async function(id, newStatus) {
    try {
        await fetch(`${API_BASE_URL}/orders/${id}/status?status=${newStatus}`, { 
            method: 'PUT',
            headers: getAuthHeaders()
        });
        fetchOrders();
    } catch (e) { console.error(e); }
}

async function handleOrderSubmit(e) {
    e.preventDefault();
    
    const client_id = parseInt(document.getElementById('order-client').value);
    const device = document.getElementById('order-device').value;
    const description = document.getElementById('order-description').value;
    
    // Validar cliente
    if (isNaN(client_id)) {
        alert('Selecciona un cliente válido antes de guardar.');
        return;
    }

    // Gather parts
    const partsSelects = document.querySelectorAll('.part-select');
    const partsQtys = document.querySelectorAll('.part-qty');
    const items = [];
    
    for (let i = 0; i < partsSelects.length; i++) {
        const sel = partsSelects[i];
        const qtyInput = partsQtys[i];
        if (!sel || !sel.value) continue;

        const rawVal = (sel.value || '').toString().trim();
        let qtyInt = Number((qtyInput.value || '').toString().trim());

        // Extract item id robustly
        function extractItemId(selectElem) {
            const v = (selectElem.value || '').toString().trim();
            if (/^\d+$/.test(v)) return parseInt(v, 10);
            // Try dataset on selected option
            const opt = selectElem.options[selectElem.selectedIndex];
            if (opt) {
                const d1 = opt.getAttribute('data-id');
                if (d1 && /^\d+$/.test(d1)) return parseInt(d1, 10);
                // Try to match by visible text against availableItems
                const text = (opt.text || '').toString().trim();
                if (text) {
                    const found = availableItems.find(ai => `${ai.emoji} ${ai.name} ($${ai.price}) - Stock: ${ai.stock}` === text || ai.name === text || text.includes(ai.name));
                    if (found) return found.id;
                }
            }
            // Last resort: extract first number in value
            const m = v.match(/(\d+)/);
            if (m) return parseInt(m[1], 10);
            return NaN;
        }

        const itemId = extractItemId(sel);

        // If no repuesto selected, skip this row (non-blocking)
        if (!rawVal) {
            console.debug('Skipping empty part row', i);
            continue;
        }

        // Coerce quantity to a positive integer (allow editing even if user typed non-integer)
        if (!Number.isFinite(qtyInt) || qtyInt <= 0) {
            qtyInt = 1;
        } else {
            qtyInt = Math.max(1, Math.floor(qtyInt));
        }

        if (!Number.isInteger(itemId) || Number.isNaN(itemId)) {
            console.warn('Could not determine numeric item_id for part row', i, sel.value, sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text);
            // Skip invalid row instead of blocking the whole submit
            continue;
        }

        items.push({
            item_id: itemId,
            quantity: qtyInt
        });
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
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE_URL}/orders/`, {
                method: 'POST',
                headers: getAuthHeaders(),
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
            alert(`Error al guardar la orden:\n${formatError(errorData) || "Ha ocurrido un problema desconocido."}`);
        }
    } catch (e) { 
        console.error(e);
        alert("Error de conexión al guardar la orden.");
    }
}

window.openPaymentModal = function(orderId) {
    currentPaymentOrderId = orderId;
    console.log('openPaymentModal invoked for order', orderId);
    document.getElementById('form-payment').reset();
    document.getElementById('payment-modal-title').innerText = `💳 Procesar Pago Orden #${orderId}`;
    const order = globalOrders.find(o => o.id === orderId);
    let amountDue = 0;
    if (order && order.items) {
        order.items.forEach(item => {
            const price = item.item ? parseFloat(item.item.price) : 0;
            amountDue += price * item.quantity;
        });
    }
    currentOrderDueAmount = amountDue;
    document.getElementById('payment-order-id').value = orderId;
    document.getElementById('payment-amount').value = `$${amountDue.toFixed(2)}`;
    toggleCardFields(); // Inicializar visibilidad
    openModal('payment-modal');
    console.log('payment-modal opened for order', orderId);
}

async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!currentPaymentOrderId) {
        alert('Orden de pago inválida');
        return;
    }
    console.log('handlePaymentSubmit start, orderId=', currentPaymentOrderId);

    const isCard = document.getElementById('payment-card-checkbox').checked;
    const payload = {
        order_id: currentPaymentOrderId,
        amount: currentOrderDueAmount,
        payment_method: isCard ? 'card' : 'cash'
    };

    // No se recopilan datos de tarjeta en el frontend — la casilla solo marca el método.
    // Enviar body vacío al procesar el pago.

    try {
        const createRes = await fetch(`${API_BASE_URL}/payments/`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });
        console.log('pagos POST response status=', createRes.status);
        if (!createRes.ok) {
            let errorText = null;
            try { errorText = await createRes.json(); } catch (_) { errorText = await createRes.text(); }
            console.error('error creating payment', errorText);
            alert(`Error al crear el pago:\n${formatError(errorText) || 'No se pudo crear el pago.'}`);
            return;
        }

        const payment = await createRes.json();
        const processRes = await fetch(`${API_BASE_URL}/payments/${payment.id}/process`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({})
        });
        console.log('process POST response status=', processRes.status);

        if (!processRes.ok) {
            let errorText = null;
            try { errorText = await processRes.json(); } catch (_) { errorText = await processRes.text(); }
            console.error('error processing payment', errorText);
            alert(`Error al procesar el pago:\n${formatError(errorText) || 'La pasarela devolvió un error.'}`);
            return;
        }

        const processed = await processRes.json();
        closeModal('payment-modal');
        const content = `
            <p><strong>Pago Procesado con éxito ✅</strong></p>
            <p><strong>ID Pago:</strong> ${processed.id}</p>
            <p><strong>Orden:</strong> ${processed.order_id}</p>
            <p><strong>Monto:</strong> $${parseFloat(processed.amount).toFixed(2)}</p>
            <p><strong>Estado:</strong> ${processed.status}</p>
            <p><strong>Transacción:</strong> ${processed.transaction_id || '-'}</p>
            <p><strong>Fecha:</strong> ${processed.paid_at ? new Date(processed.paid_at).toLocaleString() : '-'}</p>
        `;
        document.getElementById('payment-status-content').innerHTML = content;
        openModal('payment-status-modal');
        fetchOrders();
        updateDashboard();
    } catch (e) {
        console.error(e);
        alert('Error al procesar el pago. Intenta nuevamente.');
    }
}

window.toggleCardFields = function() {
    const checkbox = document.getElementById('payment-card-checkbox');
    const cardFields = document.getElementById('card-fields');
    if (!cardFields) {
        // No hay campos de tarjeta en la UI (se eliminaron intencionalmente).
        // Nada que alternar; evitamos errores por acceso a propiedades de null.
        return;
    }
    const cardInputs = cardFields.querySelectorAll('input');
    if (checkbox && checkbox.checked) {
        cardFields.style.display = 'block';
        cardInputs.forEach(input => input.required = true);
    } else {
        cardFields.style.display = 'none';
        cardInputs.forEach(input => input.required = false);
    }
}

async function deleteOrder(id) {
    if (!confirm("¿Eliminar esta orden de reparación?")) return;
    if (!currentToken) {
        alert('Debes iniciar sesión como administrador para eliminar órdenes.');
        return;
    }
    try {
        const url = `${API_BASE_URL}/orders/${id}`;
        const headers = getAuthHeaders();
        console.log('deleting order', id, url, headers);
        const res = await fetch(url, { 
            method: 'DELETE',
            headers: headers
        });
        if (!res.ok) {
            let data = null;
            try { data = await res.json(); } catch (_) { data = await res.text(); }
            alert(`Error al eliminar la orden:\n${formatError(data) || 'Acción no permitida.'}`);
            return;
        }
        fetchOrders();
    } catch (e) {
        console.error('Error eliminando orden', e);
        alert(`Error de red al eliminar la orden: ${e && e.message ? e.message : String(e)}. Revisa consola y Network.`);
    }
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
    updateSidebarUserInfo();
}

function loadToken() {
    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    if (token && user) {
        currentToken = token;
        currentUser = JSON.parse(user);
        updateUIForUserRole();
        updateSidebarUserInfo();
        return true;
    }
    return false;
}

function updateSidebarUserInfo() {
    if (currentUser) {
        document.querySelector('.user-profile .name').innerText = currentUser.username;
        document.querySelector('.user-profile .role').innerText = currentUser.role === 'admin' ? 'Administrador' : 'Técnico';
    }
}

// === Contabilidad: generar/exportar reporte mensual ===
async function generateAccountingReport() {
    const input = document.getElementById('report-month');
    if (!input || !input.value) {
        alert('Selecciona un mes válido (YYYY-MM).');
        return;
    }
    const [year, month] = input.value.split('-').map(Number);
    try {
        const res = await fetch(`${API_BASE_URL}/accounting/report?year=${year}&month=${month}`, { headers: getAuthHeaders() });
        if (!res.ok) {
            const err = await res.text();
            alert('Error al generar reporte:\n' + err);
            return;
        }
        const data = await res.json();
        // Calcular desglose por método de pago
        const entries = data.entries || [];
        const cardCount = entries.filter(e => e.payment_method === 'card').length;
        const cashCount = entries.filter(e => e.payment_method === 'cash').length;
        const otherCount = entries.length - cardCount - cashCount;
        // Mostrar resumen simple con desglose
        alert(`Reporte ${year}-${String(month).padStart(2,'0')}\nIngresos: $${data.income.toFixed(2)}\nGastos: $${data.expense.toFixed(2)}\nNeto: $${data.net.toFixed(2)}\nEntradas: ${entries.length}\n- Tarjeta: ${cardCount}\n- Efectivo: ${cashCount}\n- Otro: ${otherCount}`);
    } catch (e) {
        console.error('Error generando reporte', e);
        alert('Error de red al generar el reporte. Revisa la consola.');
    }
}

async function exportAccountingReport() {
    const input = document.getElementById('report-month');
    if (!input || !input.value) {
        alert('Selecciona un mes válido (YYYY-MM).');
        return;
    }
    const [year, month] = input.value.split('-').map(Number);
    try {
        const res = await fetch(`${API_BASE_URL}/accounting/report/${year}/${month}/export`, { headers: getAuthHeaders() });
        if (!res.ok) {
            const err = await res.text();
            alert('Error al exportar reporte:\n' + err);
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_contable_${year}_${month}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Error exportando reporte', e);
        alert('Error de red al exportar el reporte. Revisa la consola.');
    }
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
    const adminOnlyBtn = document.querySelectorAll('.admin-only-btn');
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
        
        // Mostrar/ocultar botones solo para admin
        adminOnlyBtn.forEach(el => {
            el.style.display = currentUser.role === 'admin' ? 'block' : 'none';
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
    if (args[0].startsWith(API_BASE_URL)) {
        if (!args[1]) args[1] = {};
        if (!args[1].headers) args[1].headers = {};
        if (currentToken && !args[1].headers.Authorization) {
            args[1].headers.Authorization = `Bearer ${currentToken}`;
        }
    }
    return originalFetch.apply(this, args);
};

// Extra debug binding directo al botón de pago (por si el submit no se propaga)
document.addEventListener('DOMContentLoaded', () => {
    const payBtn = document.getElementById('payment-process-btn');
    if (payBtn) {
        payBtn.addEventListener('click', (e) => {
            console.log('DEBUG: click en #payment-process-btn');
            // Nota: debug visual removido para no interferir con la UX.
            // El formulario seguirá manejando el submit normalmente.
        });
    }
});

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
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
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
            alert(`❌ Error: ${formatError(error) || 'No se pudo crear el usuario'}`);
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
            alert(`❌ Error: ${formatError(error) || 'No se pudo cambiar el rol'}`);
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
    // Hide sidebar for login
    document.querySelector('.sidebar').style.display = 'none';
    
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

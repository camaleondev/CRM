from fastapi import FastAPI, Depends, HTTPException, Form, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import timedelta, datetime, timezone

# Zona horaria local del servidor: Bogotá (UTC-5)
BOGOTA = timezone(timedelta(hours=-5))
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO
import openpyxl
import os
from fastapi.staticfiles import StaticFiles

# PDF generation
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
except Exception:
    # reportlab may not be installed in dev env; endpoint will fail until package is installed
    A4 = None
    canvas = None
    ImageReader = None

from . import models
from . import schemas
from .database import engine, get_db, SessionLocal
from .auth import (
    authenticate_user, 
    create_access_token, 
    get_current_user, 
    get_current_admin_user,
    hash_password,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Crea las tablas si no existen. En PostgreSQL puede fallar al recrear tipos ENUM
# ya creados en intentos previos, así que capturamos IntegrityError específico
# para evitar que el proceso se caiga en arranques posteriores.
from sqlalchemy.exc import IntegrityError


# Intentaremos conectar y crear tablas con reintentos para entornos
# donde la base de datos puede tardar en estar disponible (p.e. Heroku).
import time


# Crear usuario admin por defecto
def create_default_admin(db: Session):
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin:
        admin_user = models.User(
            username="admin",
            email="admin@crm.local",
            hashed_password=hash_password("admin123"),
            role=models.UserRole.admin
        )
        db.add(admin_user)
        db.commit()

# Inicialización de la base de datos en el evento `startup` en lugar
# de ejecutarla en tiempo de importación. Evita errores cuando el
# servicio aún no puede conectarse a la base de datos en Heroku.
def _init_db_default_admin(max_retries: int = 5, initial_delay: float = 2.0):
    """Intentar crear tablas y el admin por defecto con reintentos.

    - Intenta conectar al engine y ejecutar `create_all`.
    - Luego crea el admin por defecto usando `SessionLocal`.
    - Si falla, reintenta con backoff exponencial hasta `max_retries`.
    """
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            # Probar conexión rápida
            conn = engine.connect()
            conn.close()

            # Crear tablas (es seguro volver a ejecutarlo)
            try:
                models.Base.metadata.create_all(bind=engine)
            except IntegrityError as ie:
                err = str(ie).lower()
                if 'pg_type_typname_nsp_index' in err or 'duplicate key value violates unique constraint' in err:
                    print('Warning: Ignored IntegrityError during create_all (possible existing ENUMs):', ie)
                else:
                    raise

            # Crear admin por defecto usando SessionLocal
            db = SessionLocal()
            try:
                create_default_admin(db)
            finally:
                db.close()

            print('Database initialized successfully on attempt', attempt)
            return
        except Exception as e:
            print(f"DB init attempt {attempt} failed: {e}")
            if attempt == max_retries:
                print('Max retries reached; database initialization skipped.')
                return
            time.sleep(delay)
            delay *= 2


app = FastAPI(title="CRM Tech Service API 🚀", docs_url="/api/docs", openapi_url="/api/openapi.json")


# Inicializar DB en el evento `startup` (decorador colocado después de crear `app`)
@app.on_event("startup")
def on_startup():
    _init_db_default_admin()

# Servir frontend estático (index.html y assets)
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
if os.path.isdir(frontend_dir):
    # Montar los archivos estáticos en /static para no interferir con rutas de la API
    app.mount('/static', StaticFiles(directory=frontend_dir), name='static')

    # Servir index.html en la raíz
    @app.get('/', include_in_schema=False)
    def serve_index():
        index_path = os.path.join(frontend_dir, 'index.html')
        if os.path.exists(index_path):
            return FileResponse(index_path, media_type='text/html')
        return {"message": "CRM Tech Service API. Abra /api/docs para la documentación."}


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Formatear errores de Pydantic para mostrar mensajes legibles en frontend
    errors = exc.errors()
    parts = []
    for err in errors:
        loc = " -> ".join(str(l) for l in err.get('loc', []))
        msg = err.get('msg', '')
        parts.append(f"{loc}: {msg}")
    detail = "; ".join(parts) if parts else str(exc)
    return JSONResponse(status_code=422, content={"detail": detail})

@app.get("/")
def read_root():
    return {"message": "CRM Tech Service API. Abre http://127.0.0.1:8000/docs para probar los endpoints."}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- AUTENTICACION ---

@app.post("/login", response_model=schemas.Token)
def login(username: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@app.post("/register", response_model=schemas.UserOut)
def register(
    user: schemas.UserCreate, 
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    # Verificar si el usuario ya existe
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    
    # Crear nuevo usuario con el rol especificado
    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
        role=user.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/users/{user_id}/role", response_model=schemas.UserOut)
def change_user_role(
    user_id: int, 
    new_role: schemas.UserRole, 
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    user.role = new_role.role
    db.commit()
    db.refresh(user)
    return user

@app.get("/me", response_model=schemas.UserOut)
def get_current_user_info(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.put("/me/password")
def change_password(
    password_data: schemas.PasswordChange,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verificar contraseña actual
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    
    # Hash nueva contraseña
    current_user.hashed_password = hash_password(password_data.new_password)
    db.commit()
    return {"message": "Contraseña cambiada exitosamente"}

@app.get("/users/", response_model=List[schemas.UserOut])
def list_users(
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    return db.query(models.User).all()


# --- CLIENTES ---

@app.post("/clients/", response_model=schemas.ClientOut)
def create_client(
    client: schemas.ClientCreate, 
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_client = models.Client(**client.model_dump())
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

@app.get("/clients/", response_model=List[schemas.ClientOut])
def read_clients(
    skip: int = 0, 
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.Client).offset(skip).limit(limit).all()

@app.put("/clients/{client_id}", response_model=schemas.ClientOut)
def update_client(
    client_id: int, 
    client: schemas.ClientCreate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    db_client.name = client.name
    db_client.email = client.email
    db_client.phone = client.phone
    db_client.address = client.address
    
    db.commit()
    db.refresh(db_client)
    return db_client

@app.delete("/clients/{client_id}")
def delete_client(
    client_id: int,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(db_client)
    db.commit()
    return {"ok": True}

# --- INVENTARIO ---

@app.post("/inventory/", response_model=schemas.InventoryItemOut)
def create_inventory_item(
    item: schemas.InventoryItemCreate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/inventory/", response_model=List[schemas.InventoryItemOut])
def read_inventory(
    skip: int = 0, 
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.InventoryItem).offset(skip).limit(limit).all()

@app.put("/inventory/{item_id}", response_model=schemas.InventoryItemOut)
def update_inventory_item(
    item_id: int, 
    item: schemas.InventoryItemCreate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    db_item.name = item.name
    db_item.emoji = item.emoji
    db_item.category = item.category
    db_item.stock = item.stock
    db_item.price = item.price
    
    db.commit()
    db.refresh(db_item)
    return db_item

@app.delete("/inventory/{item_id}")
def delete_inventory_item(
    item_id: int,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}

# --- ÓRDENES DE SERVICIO ---

@app.post("/orders/", response_model=schemas.ServiceOrderOut)
def create_order(
    order: schemas.ServiceOrderCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validar Cliente
    db_client = db.query(models.Client).filter(models.Client.id == order.client_id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="El cliente seleccionado no existe.")

    # Validar Repuestos y Stock
    for item in order.items:
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
        if not inv_item:
            raise HTTPException(status_code=404, detail=f"El repuesto con ID {item.item_id} no existe.")
        if inv_item.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para '{inv_item.name}'. (Stock disponible: {inv_item.stock}, Solicitado: {item.quantity})")

    # Crear la orden principal
    db_order = models.ServiceOrder(
        client_id=order.client_id,
        device=order.device,
        description=order.description,
        status=order.status
    )
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    # Añadir items de la orden de forma segura y descontar stock
    for item in order.items:
        db_item = models.OrderItem(
            order_id=db_order.id,
            item_id=item.item_id,
            quantity=item.quantity
        )
        db.add(db_item)
        
        # Descontar stock
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
        inv_item.stock -= item.quantity
            
    db.commit()
    db.refresh(db_order)

    if db_order.status == models.OrderStatus.completed:
        total_income = 0.0
        for order_item in db_order.items:
            if order_item.item:
                total_income += order_item.item.price * order_item.quantity

        if total_income > 0:
            accounting_entry = models.AccountingEntry(
                entry_type=models.AccountingEntryType.income,
                category="Orden de servicio",
                amount=total_income,
                description=f"Ingreso por orden #{db_order.id} completada"
            )
            db.add(accounting_entry)
            db.commit()
            db.refresh(accounting_entry)

    return db_order

@app.get("/orders/", response_model=List[schemas.ServiceOrderOut])
def read_orders(
    skip: int = 0, 
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.ServiceOrder).offset(skip).limit(limit).all()

@app.post("/accounting/", response_model=schemas.AccountingEntryOut)
def create_accounting_entry(
    entry: schemas.AccountingEntryCreate,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_entry = models.AccountingEntry(**entry.model_dump())
    db.add(db_entry)
    db.commit()
    db.refresh(db_entry)
    return db_entry

@app.get("/accounting/", response_model=List[schemas.AccountingEntryOut])
def read_accounting_entries(
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    return db.query(models.AccountingEntry).order_by(models.AccountingEntry.created_at.desc()).all()


@app.get("/accounting/report")
def accounting_report(year: int, month: int, current_user: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """Devuelve los registros contables de un mes y totales."""
    from datetime import datetime
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)

    entries = db.query(models.AccountingEntry).filter(models.AccountingEntry.created_at >= start, models.AccountingEntry.created_at < end).order_by(models.AccountingEntry.created_at.asc()).all()

    income = sum(e.amount for e in entries if e.entry_type == models.AccountingEntryType.income)
    expense = sum(e.amount for e in entries if e.entry_type == models.AccountingEntryType.expense)
    net = income - expense

    entries_out = []
    for e in entries:
        pm = None
        if e.payment_id:
            p = db.query(models.Payment).filter(models.Payment.id == e.payment_id).first()
            if p:
                pm = p.payment_method

        entries_out.append({
            "id": e.id,
            "entry_type": e.entry_type,
            "category": e.category,
            "description": e.description,
            "amount": e.amount,
            "payment_id": e.payment_id,
            "payment_method": pm,
            "created_at": e.created_at.isoformat() if e.created_at else None
        })

    return {
        "year": year,
        "month": month,
        "income": income,
        "expense": expense,
        "net": net,
        "entries": entries_out
    }


@app.get("/accounting/report/{year}/{month}/export")
def accounting_report_export(year: int, month: int, current_user: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """Genera un archivo Excel (.xlsx) con el reporte del mes."""
    report = accounting_report(year, month, current_user, db)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Reporte_{year}_{month}"

    headers = ["ID", "Tipo", "Categoría", "Descripción", "Monto", "Pago ID", "Método Pago", "Fecha"]
    ws.append(headers)

    for e in report['entries']:
        ws.append([
            e['id'],
            'Ingreso' if e['entry_type'] == models.AccountingEntryType.income else 'Gasto',
            e['category'],
            e['description'] or '',
            float(e['amount'] or 0.0),
            e['payment_id'] or '',
            e.get('payment_method') or '',
            e['created_at'] or ''
        ])

    # Totales al final
    ws.append([])
    ws.append(["", "Total Ingresos", "", "", float(report['income'])])
    ws.append(["", "Total Gastos", "", "", float(report['expense'])])
    ws.append(["", "Neto", "", "", float(report['net'])])

    # Auto-ajustar anchos simples
    for column_cells in ws.columns:
        length = max((len(str(cell.value)) for cell in column_cells), default=0)
        ws.column_dimensions[column_cells[0].column_letter].width = min(50, length + 2)

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)

    filename = f"reporte_contable_{year}_{month}.xlsx"
    return StreamingResponse(bio, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={"Content-Disposition": f"attachment; filename={filename}"})


@app.get("/accounting/report/{year}/{month}/export/pdf")
def accounting_report_export_pdf(year: int, month: int, current_user: models.User = Depends(get_current_admin_user), db: Session = Depends(get_db)):
    """Genera un PDF simple del reporte del mes e incluye el logo si está disponible."""
    if canvas is None:
        raise HTTPException(status_code=500, detail="Dependencia 'reportlab' no está instalada en el servidor.")

    report = accounting_report(year, month, current_user, db)

    bio = BytesIO()
    c = canvas.Canvas(bio, pagesize=A4)
    page_w, page_h = A4

    # Intentar cargar logo desde frontend/assets/logo.png (ruta relativa al proyecto)
    logo_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'logo.png'))
    y_cursor = page_h - 50
    if os.path.exists(logo_path):
        try:
            img = ImageReader(logo_path)
            iw, ih = img.getSize()
            max_w = page_w - 100
            scale = min(1.0, max_w / iw)
            draw_w = iw * scale
            draw_h = ih * scale
            c.drawImage(img, 50, y_cursor - draw_h, width=draw_w, height=draw_h, preserveAspectRatio=True)
            y_cursor = y_cursor - draw_h - 20
        except Exception:
            y_cursor = y_cursor - 40
    else:
        y_cursor = y_cursor - 40

    # Título
    c.setFont("Helvetica-Bold", 16)
    c.drawString(50, y_cursor, f"Reporte Contable - {month}/{year}")
    y_cursor -= 28

    c.setFont("Helvetica", 10)
    # Encabezado simple
    headers = ["ID", "Tipo", "Categoría", "Descripción", "Monto", "Pago ID", "Método Pago", "Fecha"]
    # Dibujar filas (texto truncado para evitar overflow)
    for e in report['entries']:
        tipo = 'Ingreso' if e['entry_type'] == models.AccountingEntryType.income else 'Gasto'
        row_text = f"{e['id']} | {tipo} | {e['category'] or ''} | {e['description'] or ''} | {float(e['amount'] or 0):.2f} | {e.get('payment_method') or ''} | {e['created_at'] or ''}"
        # Truncar si es muy largo
        if len(row_text) > 220:
            row_text = row_text[:217] + '...'
        c.drawString(50, y_cursor, row_text)
        y_cursor -= 14
        if y_cursor < 80:
            c.showPage()
            y_cursor = page_h - 50

    # Totales
    y_cursor -= 10
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y_cursor, f"Total Ingresos: {report['income']}")
    y_cursor -= 16
    c.drawString(50, y_cursor, f"Total Gastos: {report['expense']}")
    y_cursor -= 16
    c.drawString(50, y_cursor, f"Neto: {report['net']}")

    c.save()
    bio.seek(0)

    filename = f"reporte_contable_{year}_{month}.pdf"
    return StreamingResponse(bio, media_type='application/pdf', headers={"Content-Disposition": f"attachment; filename={filename}"})

@app.delete("/accounting/{entry_id}")
def delete_accounting_entry(
    entry_id: int,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_entry = db.query(models.AccountingEntry).filter(models.AccountingEntry.id == entry_id).first()
    if not db_entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(db_entry)
    db.commit()
    return {"ok": True}

@app.put("/orders/{order_id}", response_model=schemas.ServiceOrderOut)
def update_order(
    order_id: int,
    order: schemas.ServiceOrderCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Validar Cliente
    db_client = db.query(models.Client).filter(models.Client.id == order.client_id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="El cliente seleccionado no existe.")

    # Devolver stock a inventario
    for old_item in db_order.items:
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == old_item.item_id).first()
        if inv_item:
            inv_item.stock += old_item.quantity
    
    db.flush()

    # Validar nuevo stock
    for item in order.items:
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
        if not inv_item:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"El repuesto con ID {item.item_id} no existe.")
        if inv_item.stock < item.quantity:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Stock insuficiente para '{inv_item.name}'. (Stock disponible: {inv_item.stock}, Solicitado: {item.quantity})")

    # Limpiar items anteriores
    db.query(models.OrderItem).filter(models.OrderItem.order_id == order_id).delete()
    
    # Actualizar campos
    db_order.client_id = order.client_id
    db_order.device = order.device
    db_order.description = order.description
    
    # Añadir nuevos y descontar stock
    new_items_list = []
    for item in order.items:
        db_item = models.OrderItem(
            order_id=order_id,
            item_id=item.item_id,
            quantity=item.quantity
        )
        new_items_list.append(db_item)
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
        inv_item.stock -= item.quantity

    db_order.items = new_items_list
    
    db.commit()
    db.refresh(db_order)
    return db_order

@app.put("/orders/{order_id}/status", response_model=schemas.ServiceOrderOut)
def update_order_status(
    order_id: int,
    status: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    old_status = db_order.status
    try:
        new_status = models.OrderStatus(status)
    except Exception:
        raise HTTPException(status_code=400, detail="Estado de orden inválido")

    db_order.status = new_status
    db.commit()
    db.refresh(db_order)

    if new_status == models.OrderStatus.completed:
        total_income = 0.0
        for order_item in db_order.items:
            if order_item.item:
                total_income += order_item.item.price * order_item.quantity

        if total_income > 0:
            accounting_entry = models.AccountingEntry(
                entry_type=models.AccountingEntryType.income,
                category="Orden de servicio",
                amount=total_income,
                description=f"Ingreso por orden #{db_order.id} completada"
            )
            db.add(accounting_entry)
            db.commit()
            db.refresh(accounting_entry)

    return db_order

@app.delete("/orders/{order_id}")
def delete_order(
    order_id: int,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    try:
        db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
        if not db_order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Devolver stock antes de eliminar
        for item in db_order.items:
            inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
            if inv_item:
                inv_item.stock += item.quantity

        # Al usar cascade en la relación `payments`, SQLAlchemy eliminará
        # automáticamente los pagos asociados al borrar la orden.
        db.delete(db_order)
        db.commit()
        return {"ok": True}
    except HTTPException:
        # Re-raise HTTPExceptions intact
        raise
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        print('ERROR deleting order:', tb)
        raise HTTPException(status_code=500, detail=str(e))

# --- PAGOS ---

@app.post("/payments/", response_model=schemas.PaymentOut)
def create_payment(
    payment: schemas.PaymentCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Crear un nuevo pago para una orden"""
    # Validar que la orden existe
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == payment.order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    
    # Validar monto positivo
    if payment.amount <= 0:
        raise HTTPException(status_code=400, detail="El monto del pago debe ser mayor a cero")

    # Validar que no haya pagos completados ya
    existing_payment = db.query(models.Payment).filter(
        models.Payment.order_id == payment.order_id,
        models.Payment.status == models.PaymentStatus.completed
    ).first()
    if existing_payment:
        raise HTTPException(status_code=400, detail="Esta orden ya tiene un pago completado")
    
    # Crear el pago
    db_payment = models.Payment(
        order_id=payment.order_id,
        amount=payment.amount,
        payment_method=payment.payment_method
    )
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)
    return db_payment

@app.get("/payments/order/{order_id}", response_model=List[schemas.PaymentOut])
def get_order_payments(
    order_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener todos los pagos de una orden"""
    return db.query(models.Payment).filter(models.Payment.order_id == order_id).all()

@app.post("/payments/{payment_id}/process", response_model=schemas.PaymentOut)
def process_payment(
    payment_id: int,
    payment_data: Optional[schemas.PaymentProcess] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Procesar un pago"""
    db_payment = db.query(models.Payment).filter(models.Payment.id == payment_id).first()
    if not db_payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    
    if db_payment.status != models.PaymentStatus.pending:
        raise HTTPException(status_code=400, detail="Este pago ya fue procesado")
    
    from datetime import datetime
    import random
    import string
    
    if db_payment.payment_method == "cash":
        # Pago en efectivo - procesar inmediatamente
        transaction_id = "CASH_" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
        db_payment.status = models.PaymentStatus.completed
        db_payment.transaction_id = transaction_id
        db_payment.paid_at = datetime.now(tz=BOGOTA)
        
    elif db_payment.payment_method == "card":
        # Pago con tarjeta: no requerimos datos en el frontend (casilla)
        # Simular procesamiento similar a efectivo pero con prefijo CARD_
        transaction_id = "CARD_" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=12))
        db_payment.status = models.PaymentStatus.completed
        db_payment.transaction_id = transaction_id
        db_payment.paid_at = datetime.now(tz=BOGOTA)
    
    db.commit()
    db.refresh(db_payment)
    
    # Crear entrada contable automática
    accounting_entry = models.AccountingEntry(
        entry_type=models.AccountingEntryType.income,
        category="Pago de Orden",
        amount=db_payment.amount,
        description=f"Pago {'en efectivo' if db_payment.payment_method == 'cash' else 'con tarjeta'} - Orden #{db_payment.order_id} - TXN: {transaction_id}",
        payment_id=db_payment.id
    )
    db.add(accounting_entry)
    db.commit()
    db.refresh(accounting_entry)

    # Si los pagos completados alcanzan o superan el total de la orden, marcarla como completada
    # Calcular total de la orden (sumatoria precio * cantidad de los items)
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == db_payment.order_id).first()
    if db_order:
        order_total = 0.0
        for oi in db_order.items:
            if oi.item:
                order_total += (oi.item.price or 0.0) * (oi.quantity or 0)

        # Sumar todos los pagos completados para esta orden
        completed_payments = db.query(models.Payment).filter(
            models.Payment.order_id == db_order.id,
            models.Payment.status == models.PaymentStatus.completed
        ).all()
        paid_total = sum(p.amount or 0.0 for p in completed_payments)

        if paid_total >= order_total and order_total > 0:
            db_order.status = models.OrderStatus.completed
            db.commit()
            db.refresh(db_order)
    
    return db_payment

@app.get("/payments/", response_model=List[schemas.PaymentOut])
def get_all_payments(
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Obtener todos los pagos (admin only)"""
    return db.query(models.Payment).order_by(models.Payment.created_at.desc()).all()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta

import models
import schemas
from database import engine, get_db
from auth import (
    authenticate_user, 
    create_access_token, 
    get_current_user, 
    get_current_admin_user,
    hash_password,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Crea las tablas si no existen
models.Base.metadata.create_all(bind=engine)

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

db = next(get_db())
create_default_admin(db)

app = FastAPI(title="CRM Tech Service API 🚀")

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
def login(username: str, password: str, db: Session = Depends(get_db)):
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
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Verificar si el usuario ya existe
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="El usuario ya existe")
    
    # Crear nuevo usuario como técnico por defecto
    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
        role=models.UserRole.technician
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
    current_user: models.User = Depends(get_current_user),
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
    current_user: models.User = Depends(get_current_user),
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
    current_user: models.User = Depends(get_current_user),
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
    return db_order

@app.get("/orders/", response_model=List[schemas.ServiceOrderOut])
def read_orders(
    skip: int = 0, 
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(models.ServiceOrder).offset(skip).limit(limit).all()

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

@app.delete("/orders/{order_id}")
def delete_order(
    order_id: int,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Devolver stock antes de eliminar
    for item in db_order.items:
        inv_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item.item_id).first()
        if inv_item:
            inv_item.stock += item.quantity
    
    db.delete(db_order)
    db.commit()
    return {"ok": True}

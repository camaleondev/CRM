from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import engine, get_db

# Crea las tablas si no existen
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="CRM Tech Service API 🚀")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CLIENTES ---

@app.post("/clients/", response_model=schemas.ClientOut)
def create_client(client: schemas.ClientCreate, db: Session = Depends(get_db)):
    db_client = models.Client(**client.model_dump())
    db.add(db_client)
    db.commit()
    db.refresh(db_client)
    return db_client

@app.get("/clients/", response_model=List[schemas.ClientOut])
def read_clients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Client).offset(skip).limit(limit).all()

@app.put("/clients/{client_id}", response_model=schemas.ClientOut)
def update_client(client_id: int, client: schemas.ClientCreate, db: Session = Depends(get_db)):
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
def delete_client(client_id: int, db: Session = Depends(get_db)):
    db_client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not db_client:
        raise HTTPException(status_code=404, detail="Client not found")
    db.delete(db_client)
    db.commit()
    return {"ok": True}

# --- INVENTARIO ---

@app.post("/inventory/", response_model=schemas.InventoryItemOut)
def create_inventory_item(item: schemas.InventoryItemCreate, db: Session = Depends(get_db)):
    db_item = models.InventoryItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@app.get("/inventory/", response_model=List[schemas.InventoryItemOut])
def read_inventory(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.InventoryItem).offset(skip).limit(limit).all()

@app.put("/inventory/{item_id}", response_model=schemas.InventoryItemOut)
def update_inventory_item(item_id: int, item: schemas.InventoryItemCreate, db: Session = Depends(get_db)):
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
def delete_inventory_item(item_id: int, db: Session = Depends(get_db)):
    db_item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_item)
    db.commit()
    return {"ok": True}

# --- ÓRDENES DE SERVICIO ---

@app.post("/orders/", response_model=schemas.ServiceOrderOut)
def create_order(order: schemas.ServiceOrderCreate, db: Session = Depends(get_db)):
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
def read_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.ServiceOrder).offset(skip).limit(limit).all()

@app.put("/orders/{order_id}", response_model=schemas.ServiceOrderOut)
def update_order(order_id: int, order: schemas.ServiceOrderCreate, db: Session = Depends(get_db)):
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
def update_order_status(order_id: int, status: models.OrderStatus, db: Session = Depends(get_db)):
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    db_order.status = status
    db.commit()
    db.refresh(db_order)
    return db_order

@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    db_order = db.query(models.ServiceOrder).filter(models.ServiceOrder.id == order_id).first()
    if not db_order:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(db_order)
    db.commit()
    return {"ok": True}

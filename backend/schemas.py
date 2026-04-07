from pydantic import BaseModel
from typing import List, Optional
from models import OrderStatus

class ClientBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class ClientOut(ClientBase):
    id: int
    class Config:
        from_attributes = True

class InventoryItemBase(BaseModel):
    name: str
    emoji: str
    category: str
    stock: int
    price: float

class InventoryItemCreate(InventoryItemBase):
    pass

class InventoryItemOut(InventoryItemBase):
    id: int
    class Config:
        from_attributes = True

class OrderItemBase(BaseModel):
    item_id: int
    quantity: int

class OrderItemCreate(OrderItemBase):
    pass

class OrderItemOut(BaseModel):
    id: int
    item: Optional[InventoryItemOut] = None
    quantity: int
    class Config:
        from_attributes = True

class ServiceOrderBase(BaseModel):
    client_id: int
    device: str
    description: str
    status: Optional[OrderStatus] = OrderStatus.pending

class ServiceOrderCreate(ServiceOrderBase):
    items: List[OrderItemCreate] = []

class ServiceOrderOut(ServiceOrderBase):
    id: int
    client: ClientOut
    items: List[OrderItemOut] = []
    class Config:
        from_attributes = True

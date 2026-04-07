from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
from datetime import datetime

# Importar enums de models pero evitar conflicto de nombres
from models import OrderStatus

class UserRoleEnum(str, Enum):
    admin = "admin"
    technician = "technician"

# --- USER SCHEMAS ---

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserRole(BaseModel):
    username: str
    role: UserRoleEnum

class UserOut(UserBase):
    id: int
    role: UserRoleEnum
    is_active: bool
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class TokenData(BaseModel):
    username: Optional[str] = None

# --- CLIENT SCHEMAS ---

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

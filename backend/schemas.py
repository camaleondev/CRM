from pydantic import BaseModel
from typing import List, Optional
from enum import Enum
from datetime import datetime

# Importar enums de models pero evitar conflicto de nombres
from .models import OrderStatus

class UserRoleEnum(str, Enum):
    admin = "admin"
    technician = "technician"

# --- USER SCHEMAS ---

class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str
    role: Optional[UserRoleEnum] = UserRoleEnum.technician

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

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

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

class AccountingEntryTypeEnum(str, Enum):
    income = "income"
    expense = "expense"

class PaymentStatusEnum(str, Enum):
    pending = "Pendiente ⏳"
    processing = "Procesando 🔄"
    completed = "Completado ✅"
    failed = "Fallido ❌"

class PaymentBase(BaseModel):
    order_id: int
    amount: float
    payment_method: Optional[str] = "credit_card"

class PaymentCreate(PaymentBase):
    pass

class PaymentProcess(BaseModel):
    """Datos para procesar un pago (solo para tarjeta)"""
    card_number: Optional[str] = None
    card_holder: Optional[str] = None
    expiry: Optional[str] = None
    cvv: Optional[str] = None

class PaymentOut(PaymentBase):
    id: int
    status: PaymentStatusEnum
    transaction_id: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True

class AccountingEntryBase(BaseModel):
    entry_type: AccountingEntryTypeEnum
    category: str
    amount: float
    description: Optional[str] = None

class AccountingEntryCreate(AccountingEntryBase):
    pass

class AccountingEntryOut(AccountingEntryBase):
    id: int
    created_at: datetime
    class Config:
        from_attributes = True

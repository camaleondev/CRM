from sqlalchemy import Column, Integer, String, Float, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
import enum
from database import Base

class OrderStatus(str, enum.Enum):
    pending = "Pendiente ⏳"
    in_progress = "En Progreso 🛠️"
    completed = "Completado ✅"

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), index=True)
    email = Column(String(100), unique=True, index=True)
    phone = Column(String(20))
    address = Column(String(200))

    orders = relationship("ServiceOrder", back_populates="client")

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), index=True)
    emoji = Column(String(10))
    category = Column(String(50))
    stock = Column(Integer, default=0)
    price = Column(Float, default=0.0)

class ServiceOrder(Base):
    __tablename__ = "service_orders"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"))
    device = Column(String(150))
    description = Column(Text)
    status = Column(Enum(OrderStatus), default=OrderStatus.pending)

    client = relationship("Client", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("service_orders.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Integer, default=1)

    order = relationship("ServiceOrder", back_populates="items")
    item = relationship("InventoryItem")

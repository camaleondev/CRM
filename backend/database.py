import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

# Determina la URL de la base de datos: usa `DATABASE_URL` si está (Heroku),
# fall back a sqlite local para desarrollo.
BASE_DIR = Path(__file__).resolve().parent
database_url = os.environ.get("DATABASE_URL")

if database_url:
    # Heroku históricamente exporta URLs que comienzan con "postgres://";
    # SQLAlchemy requiere el dialect+driver: "postgresql+psycopg2://"
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg2://", 1)
    SQLALCHEMY_DATABASE_URL = database_url
else:
    DB_PATH = BASE_DIR / 'crm.db'
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Crear engine: para SQLite necesitamos `check_same_thread`.
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

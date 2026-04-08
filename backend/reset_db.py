import os
from pathlib import Path
from sqlalchemy import create_engine

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'crm.db'

def remove_db():
    if DB_PATH.exists():
        print(f"Removing database file: {DB_PATH}")
        DB_PATH.unlink()
    else:
        print("Database file not found, nothing to remove.")

def recreate_db():
    # Use the same URL as the app
    url = f"sqlite:///{DB_PATH}"
    engine = create_engine(url, connect_args={"check_same_thread": False})

    # Import models and create tables
    import models
    models.Base.metadata.create_all(bind=engine)

    # Create default admin
    from auth import hash_password
    from sqlalchemy.orm import Session, sessionmaker
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == 'admin').first()
        if not admin:
            admin_user = models.User(
                username='admin',
                email='admin@crm.local',
                hashed_password=hash_password('admin123'),
                role=models.UserRole.admin
            )
            db.add(admin_user)
            db.commit()
            print('Default admin user created (admin / admin123)')
        else:
            print('Admin user already exists')
    finally:
        db.close()

if __name__ == '__main__':
    confirm = input('Esto eliminará la base de datos y la recreará. ¿Continuar? (si/no): ')
    if confirm.lower() not in ('si', 's', 'yes', 'y'):
        print('Operación cancelada')
        exit(0)
    remove_db()
    recreate_db()
    print('Base de datos restaurada a cero.')

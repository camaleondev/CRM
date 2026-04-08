from backend.database import SessionLocal
from backend.auth import hash_password
from backend import models

if __name__ == '__main__':
    db = SessionLocal()
    try:
        admin = db.query(models.User).filter(models.User.username == 'admin').first()
        if not admin:
            print('No admin user found')
        else:
            admin.hashed_password = hash_password('admin123')
            db.commit()
            print('Admin password hashed and updated to admin123')
    finally:
        db.close()

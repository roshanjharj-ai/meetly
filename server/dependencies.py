# dependencies.py
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
import models
import auth
import crud
import schemas

# Dependency to enforce SuperAdmin access (Moved from main.py)
async def get_current_super_admin(current_user: models.User = Depends(auth.get_current_user)):
    if current_user.user_type != 'SuperAdmin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. SuperAdmin privileges required."
        )
    return current_user

# Utility to enrich User schema with customer_slug and license status (Moved from main.py)
def enrich_user_response(db: Session, user: models.User) -> schemas.User:
    customer = crud.get_customer_by_id(db, user.customer_id)
    
    enriched_user = schemas.User.model_validate(user)
    
    if customer:
        enriched_user.customer_slug = customer.url_slug
        
        # FIX: Set license_status using the check_license_active utility
        crud.check_license_active(db, user.customer_id) 
        
        # Re-fetch license data after potential update
        license_data = crud.get_license_by_customer(db, user.customer_id) 
        
        enriched_user.license_status = license_data.status if license_data else "NOT_LICENSED"
    
    return enriched_user
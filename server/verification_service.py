# verification_service.py
import random
import string
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

# In-memory storage for codes { "email_room": (code, expiry_time) }
# In production, use Redis or a database for better scalability and persistence
verification_codes: Dict[str, tuple[str, datetime]] = {}
CODE_EXPIRY_MINUTES = 10

def _generate_code(length: int = 6) -> str:
    """Generates a random alphanumeric code."""
    characters = string.ascii_uppercase + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

def create_verification_code(email: str, room: str) -> str:
    """Generates a code, stores it with an expiry, and returns it."""
    code = _generate_code()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=CODE_EXPIRY_MINUTES)
    key = f"{email.lower()}_{room.lower()}"
    verification_codes[key] = (code, expiry)
    print(f"🔑 Generated code {code} for {key}, expires at {expiry}")
    return code

def verify_code(email: str, room: str, code: str) -> bool:
    """Checks if the provided code is valid and not expired."""
    key = f"{email.lower()}_{room.lower()}"
    stored_data = verification_codes.get(key)

    if not stored_data:
        print(f"❌ Verification failed: No code found for {key}")
        return False

    stored_code, expiry_time = stored_data
    if datetime.now(timezone.utc) > expiry_time:
        print(f"❌ Verification failed: Code expired for {key}")
        del verification_codes[key] # Clean up expired code
        return False

    if stored_code != code:
        print(f"❌ Verification failed: Invalid code provided for {key}")
        return False

    # Code is valid, remove it after verification
    del verification_codes[key]
    print(f"✅ Code verified successfully for {key}")
    return True
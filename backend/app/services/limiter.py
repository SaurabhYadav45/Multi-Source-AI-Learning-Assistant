# app/services/limiter.py
"""
Rate Limiter Service.
Provides a shared Limiter instance to be imported by API routers and registered
in the main FastAPI application.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Initialize the limiter using client IP as the rate limiting key
limiter = Limiter(key_func=get_remote_address)

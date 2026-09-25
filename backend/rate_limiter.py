import os
from slowapi import Limiter
from slowapi.util import get_remote_address

RATE_LIMIT = os.getenv("RATE_LIMIT_PER_MINUTE", "30")

# Create Limiter instance with IP keying and default 30 requests/minute limit
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{RATE_LIMIT}/minute"],
    headers_enabled=True,
)

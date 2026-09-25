# middleware.py
import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from security import decode_access_token


PUBLIC_PATHS = {
    "/",
    "/login",
    "/register",
    "/refresh",
    "/health",
    "/docs",
    "/openapi.json",
    "/redoc",
}


class JWTAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Let public paths and docs through untouched
        if path in PUBLIC_PATHS or path.startswith("/docs") or path.startswith("/redoc"):
            return await call_next(request)

        # 1. Extract the token from the Authorization header
        auth = request.headers.get("Authorization", "")
        scheme, _, token = auth.partition(" ")

        if scheme.lower() != "bearer" or not token:
            return JSONResponse(
                {"detail": "Authentication Token missing"},
                status_code=401,
            )

        # 2. Validate the token with PyJWT
        try:
            payload = decode_access_token(token)
        except jwt.ExpiredSignatureError:
            return JSONResponse({"detail": "Token has expired"}, status_code=401)
        except jwt.InvalidTokenError:
            return JSONResponse({"detail": "Invalid token"}, status_code=401)

        # 3. Optionally verify the subject exists
        subject = payload.get("sub")
        if not subject:
            return JSONResponse({"detail": "Invalid token payload"}, status_code=401)

        # 4. Stash the decoded claims for downstream handlers
        request.state.user = subject
        request.state.jwt_payload = payload

        # 5. Continue to the route
        return await call_next(request)
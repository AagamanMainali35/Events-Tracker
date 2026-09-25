from typing import Any, Optional
from fastapi import HTTPException, status


def error_dict(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    detail: Optional[Any] = None,
) -> dict:
    """Creates a standardized error response dictionary."""
    return {
        "status_code": status_code,
        "message": message,
        "detail": detail,
    }


def error_response(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    detail: Optional[Any] = None,
    headers: Optional[dict[str, str]] = None,
) -> HTTPException:
    """
    Constructs a dictionary containing message, status_code, and detail,
    and returns an HTTPException containing that dictionary as its detail.

    Usage:
        raise error_response(
            message="Invalid credentials",
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The password provided does not match.",
        )
    """
    return HTTPException(
        status_code=status_code,
        detail=error_dict(message=message, status_code=status_code, detail=detail),
        headers=headers,
    )


def raise_http_exception(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    detail: Optional[Any] = None,
    headers: Optional[dict[str, str]] = None,
) -> None:
    """
    Directly raises an HTTPException containing the error dictionary.

    Usage:
        raise_http_exception(
            message="User not found",
            status_code=status.HTTP_404_NOT_FOUND,
        )
    """
    raise error_response(message=message, status_code=status_code, detail=detail, headers=headers)


def success_response(
    data: Optional[Any] = None,
    message: str = "Success",
    status_code: int = status.HTTP_200_OK,
) -> dict:
    """Creates a standardized success response dictionary."""
    return {
        "status_code": status_code,
        "message": message,
        "data": data,
    }


# Aliases for flexibility
http_exception = error_response
custom_http_exception = error_response

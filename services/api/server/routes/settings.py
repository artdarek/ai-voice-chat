from fastapi import APIRouter
from fastapi.responses import JSONResponse

from config import API_KEY

router = APIRouter()


@router.get("/settings")
async def settings() -> JSONResponse:
    """Tell the frontend whether the server has a configured API key."""
    return JSONResponse({"server_key": bool(API_KEY)})

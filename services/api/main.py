import pathlib

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from server.routes.settings import router as settings_router
from server.routes.websocket import router as websocket_router

app = FastAPI()
app.include_router(settings_router)
app.include_router(websocket_router)

# StaticFiles — for local dev only (make run); in Docker nginx serves services/website/
STATIC_DIR = pathlib.Path(__file__).parent.parent / "website"
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

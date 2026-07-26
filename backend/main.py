import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from backend.routers import project, llm, tokens, architecture, research
from backend.services.ollama_service import OllamaService

load_dotenv()                          # BookBot_08/.env
load_dotenv(dotenv_path=r"E:\Coding\.env", override=False)  # shared key store

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Initializing BookBot...")
    ollama = OllamaService()
    is_up = await ollama.health_check()
    if is_up:
        print("[OK] Ollama is running and accessible.")
    else:
        print("[WARNING] Ollama is not reachable at configured URL.")
    
    print("BookBot running at http://localhost:8000")
    print("Remote access (Tailscale): http://0.0.0.0:8000 — configure Tailscale to use")
    
    yield
    # Shutdown
    print("Shutting down BookBot...")

app = FastAPI(title="BookBot 08 API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project.router)
app.include_router(llm.router)
app.include_router(tokens.router)
app.include_router(architecture.router)
app.include_router(research.router)

# Mount frontend files
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
async def serve_index():
    return FileResponse("frontend/index.html")

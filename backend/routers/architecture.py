import yaml
from pathlib import Path
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/architecture", tags=["architecture"])

YAML_PATH = Path(__file__).parent.parent.parent / "docs" / "architecture_matrix.yaml"


@router.get("")
async def get_architecture():
    try:
        with open(YAML_PATH, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return data
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="architecture_matrix.yaml not found")
    except yaml.YAMLError as e:
        raise HTTPException(status_code=500, detail=f"YAML parse error: {e}")

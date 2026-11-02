import os
from pathlib import Path

# Point the app at a small fake frontend build. This runs before any test
# module imports app.main, which reads PM_STATIC_DIR at import time.
FIXTURES_DIR = Path(__file__).parent / "fixtures"
os.environ["PM_STATIC_DIR"] = str(FIXTURES_DIR / "static")

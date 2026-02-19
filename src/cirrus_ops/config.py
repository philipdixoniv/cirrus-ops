"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    # Supabase
    supabase_url: str
    supabase_key: str

    # Gong
    gong_access_key: str = ""
    gong_access_key_secret: str = ""
    gong_base_url: str = "https://us-11211.api.gong.io"

    # Zoom
    zoom_account_id: str = ""
    zoom_client_id: str = ""
    zoom_client_secret: str = ""

    # Anthropic
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # Sync settings
    sync_batch_size: int = 50
    sync_concurrency: int = 5


settings = Settings()

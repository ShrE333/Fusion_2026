from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    waha_url: str = 'http://waha:3000'
    waha_api_key: str = ''
    waha_hmac_secret: str = ''
    db_path: str = '/data/bot.sqlite3'
    media_dir: str = '/data/media'
    # Optional: secure service-to-service endpoints for upgrades
    road_inference_url: str = ''
    infra_search_url: str = ''
    service_token: str = ''
    # Keep WAHA session name from incoming webhook; no default assumption.
    max_image_bytes: int = 8 * 1024 * 1024

settings = Settings()

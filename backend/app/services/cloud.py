from __future__ import annotations

from app.adapters.cloud115 import Cloud115Client, P115CloudClient
from app.errors import ValidationAppError
from app.repositories.settings import SettingsRepository


class CloudServiceFactory:
    def __init__(self, settings: SettingsRepository) -> None:
        self.settings = settings

    def create(self) -> Cloud115Client:
        try:
            cookie = self.settings.require("p115_cookie")
        except ValueError as exc:
            raise ValidationAppError(str(exc)) from exc
        return P115CloudClient(cookie)


class DirectoryService:
    def __init__(self, cloud: Cloud115Client) -> None:
        self.cloud = cloud

    def list_directories(self, parent_id: str) -> list[dict[str, object]]:
        directories = self.cloud.list_directories(parent_id)
        return [
            {
                "id": item.id,
                "name": item.name,
                "path": item.path,
                "is_directory": item.is_directory,
            }
            for item in directories
        ]

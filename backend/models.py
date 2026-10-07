from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, datetime


class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


class DailyUpdateBase(BaseModel):
    date: date
    what_i_learned: str = Field(max_length=10000)
    resources: List[str] = Field(max_length=20)
    video_url: Optional[str] = Field(default=None, max_length=2048)
    voice_note_url: Optional[str] = Field(default=None, max_length=2048)


class DailyUpdateCreate(DailyUpdateBase):
    pass


class DailyUpdate(DailyUpdateBase):
    id: str
    created_at: datetime


class ResourceBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(default="", max_length=2048)  # empty when a resource was typed as plain text
    category: Optional[str] = Field(default=None, max_length=50)
    emoji: Optional[str] = Field(default=None, max_length=16)
    notes: Optional[str] = Field(default=None, max_length=2000)


class ResourceCreate(ResourceBase):
    pass


class Resource(ResourceBase):
    id: str
    created_at: datetime

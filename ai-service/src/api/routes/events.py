from fastapi import APIRouter, Request, status

from ..response import success
from ..schemas import MovieEvent, UserInteractionEvent


router = APIRouter(prefix="/events", tags=["events"])


@router.post("/movies", status_code=status.HTTP_202_ACCEPTED)
async def movie_event(event: MovieEvent, request: Request) -> dict:
    await request.app.state.message_queue.publish_movie_event(event)
    return success({"eventId": event.eventId}, "Movie event accepted", status.HTTP_202_ACCEPTED)


@router.post("/interactions", status_code=status.HTTP_202_ACCEPTED)
async def interaction_event(event: UserInteractionEvent, request: Request) -> dict:
    await request.app.state.message_queue.publish_interaction_event(event)
    return success({"eventId": event.eventId}, "User interaction accepted", status.HTTP_202_ACCEPTED)
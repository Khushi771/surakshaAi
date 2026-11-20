import asyncio
import base64
import json
import logging
from urllib.parse import urlencode

import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import get_settings

router = APIRouter(tags=["voice transcription"])
logger = logging.getLogger(__name__)


@router.websocket("/api/transcribe/ws")
async def realtime_transcription(browser: WebSocket):
    await browser.accept()
    settings = get_settings()
    if not settings.sarvam_api_key:
        await browser.send_json({"event": "error", "message": "Sarvam is not configured. Add SARVAM_API_KEY to backend/.env and restart the backend."})
        await browser.close(code=4403)
        return

    upstream = None
    try:
        # The first client message selects only supported task options; the secret stays here.
        request = json.loads(await browser.receive_text())
        language = request.get("language_code", "auto")
        mode = request.get("mode", "codemix")
        if language not in {"auto", "en-IN", "hi-IN", "bn-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "or-IN", "pa-IN", "ta-IN", "te-IN", "as-IN", "ur-IN", "ne-IN", "kok-IN", "ks-IN", "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN"}:
            await browser.send_json({"event": "error", "message": "Unsupported transcription language."})
            await browser.close(code=4400)
            return
        if mode not in {"transcribe", "translate", "verbatim", "translit", "codemix"}:
            await browser.send_json({"event": "error", "message": "Unsupported transcription mode."})
            await browser.close(code=4400)
            return

        query = urlencode({"model": settings.sarvam_model, "language_code": language, "mode": mode,
                           "stream_type": "balanced", "endpointing": "vad", "encoding": "linear16", "sample_rate": 16000})
        upstream = await websockets.connect(
            f"wss://api.sarvam.ai/speech-to-text-realtime/ws?{query}",
            additional_headers={"api-subscription-key": settings.sarvam_api_key},
            open_timeout=15,
        )

        async def send_audio():
            while True:
                message = await browser.receive()
                if message["type"] == "websocket.disconnect":
                    return
                if message.get("bytes") is not None:
                    chunk = message["bytes"]
                    if len(chunk) > 128 * 1024:
                        await browser.send_json({"event": "error", "message": "Audio chunk is too large."})
                        return
                    await upstream.send(json.dumps({"event": "audio_input", "audio": base64.b64encode(chunk).decode("ascii")}))
                elif message.get("text"):
                    control = json.loads(message["text"])
                    if control.get("event") in {"end", "ping"}:
                        await upstream.send(json.dumps(control))
                    if control.get("event") == "end":
                        return

        async def forward_transcripts():
            async for event in upstream:
                await browser.send_text(event)
                if json.loads(event).get("event") == "session.end":
                    return

        sender = asyncio.create_task(send_audio())
        receiver = asyncio.create_task(forward_transcripts())
        done, pending = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
        if sender in done and receiver in pending:
            # Keep the receive pump alive long enough for final transcript and session.end events.
            try:
                await asyncio.wait_for(receiver, timeout=15)
            except asyncio.TimeoutError:
                receiver.cancel()
        for task in pending:
            if not task.done():
                task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for task in done:
            error = task.exception()
            if error:
                raise error
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Provider details can include request diagnostics; log server-side and return a safe message.
        logger.exception("Sarvam realtime transcription failed")
        try:
            await browser.send_json({"event": "error", "message": "Sarvam transcription could not connect. Check the API key, account credits, and backend logs."})
            await browser.close(code=1011)
        except Exception:
            pass
    finally:
        if upstream is not None:
            await upstream.close()

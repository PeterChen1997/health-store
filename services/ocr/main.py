"""OCR 微服务 — 封装 PaddleOCR 3.7.x PP-OCRv6 / PaddleOCR-VL 识别

POST /parse   上传图片 → 返回 { markdown, json_data, raw_text, mode, analysis_text, run_id }
GET  /health  健康检查
"""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import os
import re
import time
import tempfile
import uuid
import warnings
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

from paddleocr import PaddleOCR, PaddleOCRVL


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 服务启动后后台预热，避免 /health 被模型冷启动阻塞。
    warmup_task = asyncio.create_task(asyncio.to_thread(warmup_pipeline))
    try:
        yield
    finally:
        if not warmup_task.done():
            warmup_task.cancel()
            try:
                await warmup_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="health-store OCR service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_pipelines: dict[str, Any] = {}
_pipeline_ready_modes: set[str] = set()

_WARMUP_IMAGE_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAUAAAADwCAIAAAD+Tyo8AAAEJUlEQVR42u3cOxKDMBAEUd3/0hCREYii9Jt9nTvp2Q5sbLcLwLE0CgABAxAwAAEDAgYgYAACBiBgQMAABAxAwICAAQgYgIABCBgQMAABAxAwAAEDAgYgYAACBgQMoGTA7aG6UB44mWhDwI6VEwEbiQdOBGweTtjYPeB2Po5VwAIWsJNlQ8ACFrCABSxgAQtYwI6VEwEL2MmyIWABC1jARuKBEwGbhxNOBOxYOWFDwI6VEwEbiQdOBGweTtgQsGPlRMBG4oETAZuHB05ODRjAz+/zCRgQsICBagF7h8MDJz7EMg8nbAjYsXIiYCPxwImAzcMJBOxYOWFDwI6VEwEbiQdOBGweTtgQsGPlRMBG4oETAX98Vcx3VrP/H3v0bVT4JrOABSxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMAC9pQPnAjYsXLChoAdKycCNhIPnAjYPJywIWDHygkbAnasnAjYSDxwImDzcMKGgB0rJwI2Eg+cCNg84ETAjpUTNgTsWDkRsJF44ETA5uGEDQE7Vk4EbCQeOBGwkXjgRMDm4YQNATtWTgRsJB44EbB5OOHkiIABDP1naQEDAhYwkBewdzg8cOJDLPNwwoaAHSsnAjYSD5wI2DycQMCOlRM2BOxYORGwkXjgRMDm4YQNATtWTgRsJB44EbB5wImAHSsnbOwbcN6vRvpfVecHNJFOBCxgAQtYwAIWsIAFLGABC1jAAhawgAUsYAELWMACFrBnfTxw4jmweTjhRMCOlRM2BOxYORGwkXjgRMDm4YQNATtWTgRsJB44EbB5eOBEwObhhA0BO1ZOBGwkHjgRsHk4YUPAjpUTNgTsWDkRsJF44ETA5uGEDQE7Vk4EbCQeOBGwecCJgB0rJ2zMCxjA0P+1FDAgYAEDeQF7h8MDJz7EMg8nbAjYsXIiYCPxwImAzcMJBOxYOWFDwI6VEwEbiQdOBGweTtgQsGPlRMBG4oETAZsHnAjYsXLChoAdKycCNhIPnAj49VUxv9vsf1Wdn7BGOhGwgAUsYAELWMACFrCABSxgAQtYwAIWsIAFLGABC1jAnvXxwInnwObhhBMBO1ZO2BCwY+VEwEbigRMBm4cTNgTsWDkRsJF44ETA5uGBEwGbhxM2BOxYORGwkXjgRMDm4YQNATtWTtgQsGPlRMBG4oETAZuHEzYE7Fg5EbCReOCkasAAhv6rloABAQsYiAkYwIJ31BQAAgYgYAACBgQMQMAABAxAwICAAQgYgIABAQMQMAABAxAwIGAAAgYgYAACBgQMQMAABAwIGICAAQgYgIABAQMQMAABAxAwIGAAAgYgYEDAAAQMQMAABAwIGICAAQgYEDAAAQMQMAABAwIGIGAAAgYgYEDAAAQMQMCAgAEIGICAAQgYEDAAAQMQMAABAwIGsJQbfdnrdLdlrlEAAAAASUVORK5CYII="
)


class VlMarkdownMissingError(RuntimeError):
    """PaddleOCR-VL did not return structured Markdown."""


_FOOTER_DATE_PATTERN = re.compile(
    r"(日期|时间|date|(?:19|20)\d{2}\s*[年./-]\s*\d{1,2}(?:\s*[月./-]\s*\d{1,2})?)",
    re.IGNORECASE,
)


def get_analysis_mode() -> str:
    mode = os.environ.get("OCR_ANALYSIS_MODE", "vl").strip().lower()
    if mode not in {"vl", "ppocr"}:
        raise ValueError("OCR_ANALYSIS_MODE 只支持 vl 或 ppocr")
    return mode


def _build_ppocr_pipeline() -> PaddleOCR:
    return PaddleOCR(
        text_detection_model_name="PP-OCRv6_medium_det",
        text_recognition_model_name="PP-OCRv6_medium_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
        engine="paddle",
    )


def _build_vl_pipeline() -> PaddleOCRVL:
    kwargs: dict[str, Any] = {
        "device": os.environ.get("PADDLEOCR_DEVICE", "cpu"),
    }

    vl_rec_backend = os.environ.get("PADDLEOCR_VL_REC_BACKEND")
    if vl_rec_backend:
        kwargs["vl_rec_backend"] = vl_rec_backend

    vl_rec_server_url = os.environ.get("PADDLEOCR_VL_REC_SERVER_URL")
    if vl_rec_server_url:
        kwargs["vl_rec_server_url"] = vl_rec_server_url

    return PaddleOCRVL(**kwargs)


def get_pipeline(mode: str | None = None) -> Any:
    current_mode = mode or get_analysis_mode()
    if current_mode not in _pipelines:
        if current_mode == "vl":
            _pipelines[current_mode] = _build_vl_pipeline()
        else:
            _pipelines[current_mode] = _build_ppocr_pipeline()
    return _pipelines[current_mode]


def warmup_pipeline() -> None:
    mode = get_analysis_mode()
    if mode in _pipeline_ready_modes:
        return

    pipeline = get_pipeline(mode)
    image_bytes = base64.b64decode(_WARMUP_IMAGE_BASE64)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        list(pipeline.predict(tmp_path))
        _pipeline_ready_modes.add(mode)
    finally:
        os.unlink(tmp_path)


def _extract_texts_from_json(obj: Any) -> list[str]:
    """递归从 PaddleOCR json 结果中提取所有文本片段"""
    texts: list[str] = []
    if isinstance(obj, dict):
        for key in ("text", "rec_text", "transcription"):
            if key in obj and isinstance(obj[key], str) and obj[key].strip():
                texts.append(obj[key].strip())
        for v in obj.values():
            texts.extend(_extract_texts_from_json(v))
    elif isinstance(obj, list):
        for item in obj:
            texts.extend(_extract_texts_from_json(item))
    return texts


def _extract_ocr_texts(res_json: Any) -> list[str]:
    if isinstance(res_json, dict):
        root = res_json.get("res", res_json)
        rec_texts = root.get("rec_texts") if isinstance(root, dict) else None
        if isinstance(rec_texts, list):
            return [text.strip() for text in rec_texts if isinstance(text, str) and text.strip()]

    return _extract_texts_from_json(res_json)


def _extract_vl_markdown(res: Any) -> str:
    markdown = getattr(res, "markdown", None)
    if isinstance(markdown, dict):
        markdown_texts = markdown.get("markdown_texts")
        if isinstance(markdown_texts, str):
            return markdown_texts.strip()
    if isinstance(markdown, str):
        return markdown.strip()
    return ""


def _extract_vl_blocks(res_json: Any) -> list[Any]:
    if not isinstance(res_json, dict):
        return []

    root = res_json.get("res", res_json)
    if not isinstance(root, dict):
        return []

    blocks = root.get("parsing_res_list")
    if isinstance(blocks, list):
        return blocks
    return []


def _extract_vl_supplemental_texts(blocks: list[Any], existing_text: str) -> list[str]:
    texts: list[str] = []
    seen: set[str] = set()

    for block in blocks:
        if not isinstance(block, dict):
            continue

        label = str(block.get("block_label") or "").strip().lower()
        content = block.get("block_content")
        if label != "footer" or not isinstance(content, str):
            continue

        text = content.strip()
        if not text or text in existing_text or text in seen:
            continue
        if _FOOTER_DATE_PATTERN.search(text):
            texts.append(text)
            seen.add(text)

    return texts


def _parse_ppocr_output(output: list[Any]) -> dict[str, Any]:
    markdown_parts: list[str] = []
    json_data: list[Any] = []

    for res in output:
        res_json = res.json
        texts = _extract_ocr_texts(res_json)
        if texts:
            markdown_parts.append("\n".join(texts))
        json_data.append(res_json)

    markdown = "\n\n".join(markdown_parts)

    # fallback：markdown 为空时从 json 结构中提取纯文本
    raw_text = ""
    if not markdown.strip():
        texts = _extract_texts_from_json(json_data)
        raw_text = "\n".join(texts)

    analysis_text = markdown or raw_text
    return {
        "markdown": analysis_text,
        "analysis_text": analysis_text,
        "json_data": json_data,
        "raw_text": raw_text,
    }


def _parse_vl_output(output: list[Any]) -> dict[str, Any]:
    markdown_parts: list[str] = []
    json_data: list[Any] = []
    blocks: list[Any] = []

    for res in output:
        res_json = res.json
        markdown = _extract_vl_markdown(res)
        if markdown:
            markdown_parts.append(markdown)
        json_data.append(res_json)
        blocks.extend(_extract_vl_blocks(res_json))

    analysis_text = "\n\n".join(markdown_parts)
    if not analysis_text.strip():
        raise VlMarkdownMissingError(
            "PaddleOCR-VL 未返回 markdown_texts，无法保证表格结构；请先核查真实输出字段。"
        )

    supplemental_texts = _extract_vl_supplemental_texts(blocks, analysis_text)
    if supplemental_texts:
        analysis_text = "\n\n".join([analysis_text, *supplemental_texts])

    return {
        "markdown": analysis_text,
        "analysis_text": analysis_text,
        "json_data": json_data,
        "raw_text": analysis_text,
        "blocks": blocks,
    }


@app.get("/health")
def health() -> dict[str, str]:
    mode = get_analysis_mode()
    return {
        "status": "ok",
        "pipeline": "ready" if mode in _pipeline_ready_modes else "warming",
        "mode": mode,
    }


@app.post("/parse")
async def parse_image(
    file: UploadFile = File(...),
    run_id: str | None = Form(default=None),
) -> dict[str, Any]:
    started = time.perf_counter()
    mode = get_analysis_mode()
    current_run_id = run_id.strip() if run_id and run_id.strip() else str(uuid.uuid4())
    image_exts = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"}
    ext = os.path.splitext(file.filename or "")[-1].lower()
    is_image_type = file.content_type and file.content_type.startswith("image/")
    is_image_ext = ext in image_exts
    if not is_image_type and not is_image_ext:
        raise HTTPException(
            status_code=400,
            detail=f"只接受图片文件，收到 content_type={file.content_type!r} ext={ext!r}",
        )

    raw = await file.read()
    suffix = os.path.splitext(file.filename or "img.jpg")[-1] or ".jpg"

    if mode not in _pipeline_ready_modes:
        raise HTTPException(status_code=503, detail="OCR pipeline is still warming")

    # 大图降采样：最长边超过阈值时用 Pillow 按比例缩放，显著缩短 CPU 推理时间。
    # 失败时静默回退到原始字节，不中断 OCR。
    max_edge = int(os.environ.get("OCR_MAX_IMAGE_EDGE", "2200"))
    resized = False
    try:
        from PIL import Image, ImageOps  # noqa: PLC0415
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        w, h = img.size
        longest = max(w, h)
        if longest > max_edge:
            scale = max_edge / longest
            new_size = (round(w * scale), round(h * scale))
            img = img.resize(new_size, Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            raw = buf.getvalue()
            suffix = ".jpg"
            resized = True
    except Exception as exc:  # noqa: BLE001
        logging.warning("OCR image resize failed, using original: %s", exc)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        tmp_path = tmp.name

    try:
        pipeline = get_pipeline(mode)
        predict_started = time.perf_counter()
        output = list(pipeline.predict(tmp_path))
        predict_ms = round((time.perf_counter() - predict_started) * 1000)

        try:
            parsed = _parse_vl_output(output) if mode == "vl" else _parse_ppocr_output(output)
        except VlMarkdownMissingError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        parsed.update({
            "mode": mode,
            "run_id": current_run_id,
            "timing": {
                "predict_ms": predict_ms,
                "total_ms": round((time.perf_counter() - started) * 1000),
                "resized": resized,
            },
        })
        return parsed
    finally:
        os.unlink(tmp_path)

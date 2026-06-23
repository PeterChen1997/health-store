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
import math
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


def _parse_pdf_pages(raw: bytes, mode: str) -> dict[str, Any]:
    """将 PDF 每页渲染为 JPEG 并逐页 OCR，返回拼接结果。"""
    import fitz  # noqa: PLC0415  (PyMuPDF)

    doc = fitz.open(stream=raw, filetype="pdf")
    max_edge = int(os.environ.get("OCR_MAX_IMAGE_EDGE", "2200"))
    pipeline = get_pipeline(mode)
    all_markdowns: list[str] = []
    all_json_data: list[Any] = []
    all_blocks: list[Any] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        mat = fitz.Matrix(200 / 72, 200 / 72)  # ~200 DPI
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
        img_bytes = pix.tobytes("jpeg")

        try:
            from PIL import Image  # noqa: PLC0415
            img = Image.open(io.BytesIO(img_bytes))
            w, h = img.size
            if max(w, h) > max_edge:
                scale = max_edge / max(w, h)
                img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=90)
                img_bytes = buf.getvalue()
        except Exception as exc:  # noqa: BLE001
            logging.warning("PDF page %d resize failed: %s", page_num + 1, exc)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(img_bytes)
            tmp_path = tmp.name

        try:
            output = list(pipeline.predict(tmp_path))
            try:
                parsed = _parse_vl_output(output) if mode == "vl" else _parse_ppocr_output(output)
            except VlMarkdownMissingError:
                parsed = {"markdown": "", "json_data": [], "blocks": []}

            page_markdown = parsed.get("markdown", "").strip()
            label = f"--- 第 {page_num + 1} 页 ---"
            all_markdowns.append(f"{label}\n\n{page_markdown}" if page_markdown else f"{label}（无识别文本）")
            json_data = parsed.get("json_data")
            if isinstance(json_data, list):
                all_json_data.extend(json_data)
            blocks = parsed.get("blocks")
            if isinstance(blocks, list):
                all_blocks.extend(blocks)
        finally:
            os.unlink(tmp_path)

    doc.close()
    combined = "\n\n".join(all_markdowns)
    return {
        "markdown": combined,
        "analysis_text": combined,
        "json_data": all_json_data,
        "raw_text": combined,
        "blocks": all_blocks,
    }


def _find_overlap(a: list[str], b: list[str], max_check: int = 30) -> int:
    """找到 a 的尾部与 b 的头部的最长公共非空行序列。"""
    limit = min(len(a), len(b), max_check)
    for length in range(limit, 0, -1):
        tail = [ln.strip() for ln in a[-length:] if ln.strip()]
        head = [ln.strip() for ln in b[:length] if ln.strip()]
        if tail and tail == head:
            return length
    return 0


def _merge_tile_markdowns(markdowns: list[str]) -> str:
    """合并多块 tile OCR 结果，去除重叠区域的重复行。"""
    if not markdowns:
        return ""
    result = markdowns[0].splitlines()
    for md in markdowns[1:]:
        lines = md.splitlines()
        skip = _find_overlap(result, lines)
        result.extend(lines[skip:])
    return "\n".join(result)


def _tile_and_ocr(raw: bytes, n_tiles: int, mode: str, pipeline: Any) -> dict[str, Any]:
    """将图片沿最长边切分为 n_tiles 块，每块单独 OCR 后拼接，保留各块原始分辨率细节。"""
    from PIL import Image, ImageOps  # noqa: PLC0415

    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    max_edge = int(os.environ.get("OCR_MAX_IMAGE_EDGE", "2200"))
    overlap = 0.15
    # 沿最长边切割：竖版按行，横版按列
    tile_by_col = w > h
    dim = w if tile_by_col else h
    stride = dim / n_tiles

    all_markdowns: list[str] = []
    all_json_data: list[Any] = []
    all_blocks: list[Any] = []

    for i in range(n_tiles):
        d0 = int(i * stride)
        d1 = min(dim, int(i * stride + stride * (1 + overlap)))
        tile = img.crop((d0, 0, d1, h) if tile_by_col else (0, d0, w, d1))

        tw, th = tile.size
        if max(tw, th) > max_edge:
            scale = max_edge / max(tw, th)
            tile = tile.resize((round(tw * scale), round(th * scale)), Image.LANCZOS)

        buf = io.BytesIO()
        tile.save(buf, format="JPEG", quality=90)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            tmp.write(buf.getvalue())
            tmp_path = tmp.name

        try:
            output = list(pipeline.predict(tmp_path))
            try:
                parsed = _parse_vl_output(output) if mode == "vl" else _parse_ppocr_output(output)
            except VlMarkdownMissingError:
                parsed = {"markdown": "", "json_data": [], "blocks": []}
            all_markdowns.append(parsed.get("markdown", "").strip())
            tile_json = parsed.get("json_data")
            if isinstance(tile_json, list):
                all_json_data.extend(tile_json)
            tile_blocks = parsed.get("blocks")
            if isinstance(tile_blocks, list):
                all_blocks.extend(tile_blocks)
        finally:
            os.unlink(tmp_path)

    combined = _merge_tile_markdowns(all_markdowns)
    return {
        "markdown": combined,
        "analysis_text": combined,
        "json_data": all_json_data,
        "raw_text": combined,
        "blocks": all_blocks,
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
    is_pdf = ext == ".pdf" or file.content_type == "application/pdf"
    if not is_image_type and not is_image_ext and not is_pdf:
        raise HTTPException(
            status_code=400,
            detail=f"只接受图片或 PDF 文件，收到 content_type={file.content_type!r} ext={ext!r}",
        )

    raw = await file.read()

    if mode not in _pipeline_ready_modes:
        raise HTTPException(status_code=503, detail="OCR pipeline is still warming")

    # PDF 分支：逐页渲染 + OCR，结果拼接返回
    if is_pdf:
        try:
            parsed = await asyncio.to_thread(_parse_pdf_pages, raw, mode)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"PDF 解析失败: {exc}") from exc
        parsed.update({
            "mode": mode,
            "run_id": current_run_id,
            "timing": {
                "predict_ms": None,
                "total_ms": round((time.perf_counter() - started) * 1000),
                "resized": False,
            },
        })
        return parsed

    suffix = os.path.splitext(file.filename or "img.jpg")[-1] or ".jpg"
    max_edge = int(os.environ.get("OCR_MAX_IMAGE_EDGE", "2200"))
    pipeline = get_pipeline(mode)

    # 最长边超过 max_edge 时切块：竖版按行、横版按列，每块独立 OCR 保留细节。
    n_tiles = 1
    try:
        from PIL import Image, ImageOps  # noqa: PLC0415
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            probe = Image.open(io.BytesIO(raw))
        probe = ImageOps.exif_transpose(probe)
        longest = max(probe.size)
        if longest > max_edge:
            n_tiles = min(math.ceil(longest / max_edge), 4)
    except Exception as exc:  # noqa: BLE001
        logging.warning("图片维度检测失败，回退到单图模式: %s", exc)

    if n_tiles >= 2:
        predict_started = time.perf_counter()
        try:
            parsed = await asyncio.to_thread(_tile_and_ocr, raw, n_tiles, mode, pipeline)
        except VlMarkdownMissingError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Tiling OCR 失败: {exc}") from exc
        parsed.update({
            "mode": mode,
            "run_id": current_run_id,
            "timing": {
                "predict_ms": round((time.perf_counter() - predict_started) * 1000),
                "total_ms": round((time.perf_counter() - started) * 1000),
                "resized": False,
                "tiled": n_tiles,
            },
        })
        return parsed

    # 单图：最长边超限时等比缩放后整图 OCR
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
            img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
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

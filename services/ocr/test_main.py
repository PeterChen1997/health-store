from __future__ import annotations

import asyncio
import threading
import unittest

import main
from main import VlMarkdownMissingError, _parse_vl_output, lifespan


class FakePaddleResult:
    def __init__(self, markdown: object, json: object):
        self.markdown = markdown
        self.json = json


class PaddleOcrVlParsingTest(unittest.TestCase):
    def test_extracts_markdown_texts_and_parsing_blocks(self) -> None:
        result = FakePaddleResult(
            markdown={
                "markdown_texts": "# 检验报告\n\n<table><tr><td>项目</td></tr></table>",
                "markdown_images": {},
            },
            json={
                "res": {
                    "parsing_res_list": [
                        {
                            "block_label": "table",
                            "block_content": "<table><tr><td>项目</td></tr></table>",
                        }
                    ]
                }
            },
        )

        parsed = _parse_vl_output([result])

        self.assertEqual(parsed["analysis_text"], "# 检验报告\n\n<table><tr><td>项目</td></tr></table>")
        self.assertEqual(parsed["markdown"], parsed["analysis_text"])
        self.assertEqual(parsed["raw_text"], parsed["analysis_text"])
        self.assertEqual(parsed["blocks"], [{"block_label": "table", "block_content": "<table><tr><td>项目</td></tr></table>"}])
        self.assertEqual(parsed["json_data"], [result.json])

    def test_adds_footer_date_to_analysis_text(self) -> None:
        result = FakePaddleResult(
            markdown={
                "markdown_texts": "# 蠕形螨检查报告\n\n<table><tr><td>OD</td></tr></table>\n\n检查者：",
                "markdown_images": {},
            },
            json={
                "res": {
                    "parsing_res_list": [
                        {
                            "block_label": "table",
                            "block_content": "<table><tr><td>OD</td></tr></table>",
                        },
                        {
                            "block_label": "text",
                            "block_content": "检查者：",
                        },
                        {
                            "block_label": "footer",
                            "block_content": "日期：2024年3月21日星期四",
                        },
                    ]
                }
            },
        )

        parsed = _parse_vl_output([result])

        self.assertIn("日期：2024年3月21日星期四", parsed["analysis_text"])
        self.assertEqual(parsed["markdown"], parsed["analysis_text"])
        self.assertEqual(parsed["raw_text"], parsed["analysis_text"])

    def test_raises_when_vl_markdown_texts_are_missing(self) -> None:
        result = FakePaddleResult(
            markdown={"markdown_images": {}},
            json={"res": {"parsing_res_list": [], "rec_texts": ["散字", "回退"]}},
        )

        with self.assertRaisesRegex(VlMarkdownMissingError, "markdown_texts"):
            _parse_vl_output([result])


class OcrServiceLifespanTest(unittest.IsolatedAsyncioTestCase):
    async def test_lifespan_enters_before_warmup_finishes(self) -> None:
        started = threading.Event()
        release = threading.Event()
        original_warmup = main.warmup_pipeline

        def blocking_warmup() -> None:
            started.set()
            release.wait(timeout=2)

        main.warmup_pipeline = blocking_warmup

        async def run_context() -> None:
            async with lifespan(None):
                release.set()

        try:
            await asyncio.wait_for(run_context(), timeout=0.2)
        finally:
            release.set()
            main.warmup_pipeline = original_warmup


if __name__ == "__main__":
    unittest.main()

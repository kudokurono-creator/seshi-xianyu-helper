import unittest

from utils.ai_model_discovery import build_models_url, parse_models_response


class AIModelDiscoveryTests(unittest.TestCase):
    def test_build_models_url_strips_trailing_slashes(self):
        self.assertEqual(
            build_models_url("https://api.deepseek.com/v1///"),
            "https://api.deepseek.com/v1/models",
        )

    def test_parse_models_response_returns_sorted_unique_model_ids(self):
        payload = {
            "data": [
                {"id": "deepseek-chat"},
                {"id": "deepseek-reasoner"},
                {"id": "deepseek-chat"},
                {"name": "missing-id"},
            ]
        }
        self.assertEqual(
            parse_models_response(payload),
            ["deepseek-chat", "deepseek-reasoner"],
        )


if __name__ == "__main__":
    unittest.main()

import unittest

from ai_reply_engine import AIReplyEngine


class _Message:
    def __init__(self, content, reasoning_content=None):
        self.content = content
        self.reasoning_content = reasoning_content


class _Choice:
    def __init__(self, content, finish_reason="stop", reasoning_content=None):
        self.message = _Message(content, reasoning_content)
        self.finish_reason = finish_reason


class _Response:
    def __init__(self, choice):
        self.choices = [choice]


class _Completions:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return next(self.responses)


class _Client:
    def __init__(self, responses):
        self.chat = type("Chat", (), {"completions": _Completions(responses)})()


class AIReplyEngineTests(unittest.TestCase):
    def test_empty_content_from_reasoning_model_is_retried_with_more_tokens(self):
        client = _Client([
            _Response(_Choice("", finish_reason="length", reasoning_content="正在思考")),
            _Response(_Choice("您好，资料已准备好", finish_reason="stop")),
        ])
        settings = {"model_name": "deepseek-v4-flash", "base_url": "https://api.deepseek.com"}

        reply = AIReplyEngine()._call_openai_api(
            client,
            settings,
            [{"role": "user", "content": "请回复"}],
            max_tokens=100,
        )

        self.assertEqual(reply, "您好，资料已准备好")
        self.assertEqual(len(client.chat.completions.calls), 2)
        self.assertGreater(client.chat.completions.calls[1]["max_tokens"], 100)


if __name__ == "__main__":
    unittest.main()

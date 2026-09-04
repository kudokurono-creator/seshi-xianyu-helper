from pathlib import Path
import unittest

from XianyuAutoAsync import XianyuLive


ROOT = Path(__file__).resolve().parents[1]


class PaidOrderDeliveryTests(unittest.TestCase):
    def test_text_card_creation_maps_content_to_backend_text_content(self):
        source = (ROOT / "frontend/components/CardList.tsx").read_text(encoding="utf-8")
        add_handler = source[source.index("const handleAddCard"):source.index("const toggleCardStatus")]
        self.assertIn("text_content", add_handler)

    def test_seller_paid_card_event_extracts_order_and_chat_context(self):
        event = {
            "1": "4279464507802.PNM",
            "2": "66081021918@goofish",
            "3": 1,
            "4": {
                "detailNotice": "[我已付款，等待你发货]",
                "reminderUrl": "fleamarket://message_chat?itemId=1080093917464&peerUserId=2215438822148&sid=66081021918",
                "reminderTitle": "陵零道荣",
                "extJson": '{"updateKey":"66081021918:5127393674498004829:63:TRADE_PAID_DONE_SELLER:26"}',
            },
        }
        bot = XianyuLive.__new__(XianyuLive)
        bot.cookie_id = "3882580806"

        result = bot._extract_auto_delivery_event(event)

        self.assertIsNotNone(result)
        self.assertEqual(result["order_id"], "5127393674498004829")
        self.assertEqual(result["item_id"], "1080093917464")
        self.assertEqual(result["buyer_id"], "2215438822148")
        self.assertEqual(result["chat_id"], "66081021918")

    def test_paid_messages_are_triggers_but_waiting_payment_is_not(self):
        source = (ROOT / "XianyuAutoAsync.py").read_text(encoding="utf-8")
        trigger_block = source[source.index("def _is_auto_delivery_trigger"):source.index("def _extract_order_id")]
        self.assertIn("[我已付款，等待你发货]", trigger_block)
        self.assertIn("[已付款，待发货]", trigger_block)
        self.assertIn("[买家已付款]", trigger_block)
        self.assertIn("[付款完成]", trigger_block)
        self.assertNotIn("[我已拍下，待付款]", trigger_block)

    def test_text_card_does_not_consume_inventory(self):
        source = (ROOT / "XianyuAutoAsync.py").read_text(encoding="utf-8")
        text_start = source.index("elif rule['card_type'] == 'text':")
        text_end = source.index("elif rule['card_type'] == 'data':", text_start)
        text_branch = source[text_start:text_end]
        self.assertIn("rule['text_content']", text_branch)
        self.assertNotIn("consume_batch_data", text_branch)

    def test_delivery_is_marked_after_message_send_and_before_confirmation(self):
        source = (ROOT / "XianyuAutoAsync.py").read_text(encoding="utf-8")
        handler = source[source.index("async def _handle_auto_delivery"):source.index("async def refresh_token")]
        self.assertLess(handler.index("await self.send_msg"), handler.index("self.mark_delivery_sent"))
        self.assertLess(handler.index("self.mark_delivery_sent"), handler.index("await self.auto_confirm"))

    def test_orders_have_persistent_system_shipped_column_and_duplicate_guard(self):
        db_source = (ROOT / "db_manager.py").read_text(encoding="utf-8")
        self.assertIn("ALTER TABLE orders ADD COLUMN system_shipped", db_source)
        source = (ROOT / "XianyuAutoAsync.py").read_text(encoding="utf-8")
        handler = source[source.index("async def _handle_auto_delivery"):source.index("async def refresh_token")]
        self.assertIn("is_order_system_shipped", handler)


if __name__ == "__main__":
    unittest.main()

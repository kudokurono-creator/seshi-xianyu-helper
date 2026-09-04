from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ItemCreationContractTests(unittest.TestCase):
    def test_item_list_renders_add_modal_and_submits_create_request(self):
        source = (ROOT / "frontend" / "components" / "ItemList.tsx").read_text(encoding="utf-8")

        self.assertIn("showAddModal && createPortal", source)
        self.assertIn("createItem(addForm.cookie_id", source)


    def test_backend_exposes_authenticated_item_creation_route(self):
        source = (ROOT / "reply_server.py").read_text(encoding="utf-8")

        self.assertIn('@app.post("/items/{cookie_id}")', source)
        self.assertIn("save_item_basic_info", source)

    def test_sync_route_is_registered_before_dynamic_cookie_route(self):
        source = (ROOT / "reply_server.py").read_text(encoding="utf-8")
        self.assertLess(source.index('@app.post("/items/get-all-from-account")'), source.index('@app.post("/items/{cookie_id}")'))


if __name__ == "__main__":
    unittest.main()

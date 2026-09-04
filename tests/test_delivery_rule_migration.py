import sqlite3
import tempfile
import unittest
from pathlib import Path

from db_manager import DBManager


class DeliveryRuleMigrationTests(unittest.TestCase):
    def test_legacy_delivery_rules_are_upgraded_for_user_scoped_rules(self):
        """旧数据库升级后仍应能按用户创建和读取自动发货规则。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "legacy.db"
            connection = sqlite3.connect(db_path)
            connection.execute(
                """
                CREATE TABLE delivery_rules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    keyword TEXT NOT NULL,
                    card_id INTEGER NOT NULL,
                    delivery_count INTEGER DEFAULT 1,
                    enabled BOOLEAN DEFAULT TRUE,
                    description TEXT,
                    delivery_times INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.commit()
            connection.close()

            manager = DBManager(str(db_path))
            try:
                cursor = manager.conn.cursor()
                cursor.execute(
                    "INSERT INTO cards (name, type, text_content, user_id) VALUES (?, ?, ?, ?)",
                    ("日语资料", "text", "https://example.invalid/link", 7),
                )
                card_id = cursor.lastrowid
                manager.conn.commit()

                rule_id = manager.create_delivery_rule(
                    keyword="日语学习资料",
                    card_id=card_id,
                    delivery_count=1,
                    enabled=True,
                    description="自动发货",
                    user_id=7,
                )

                rules = manager.get_all_delivery_rules(user_id=7)
                self.assertEqual(len(rules), 1)
                self.assertEqual(rules[0]["id"], rule_id)
                self.assertEqual(rules[0]["keyword"], "日语学习资料")
                self.assertEqual(rules[0]["card_id"], card_id)
            finally:
                manager.close()


if __name__ == "__main__":
    unittest.main()

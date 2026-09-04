import getpass

from db_manager import db_manager


def _prompt_non_empty(prompt: str) -> str:
    while True:
        val = input(prompt).strip()
        if val:
            return val


def _prompt_password_twice() -> str:
    while True:
        p1 = getpass.getpass('请输入管理员密码（不回显）: ').strip()
        p2 = getpass.getpass('请再次输入管理员密码（不回显）: ').strip()
        if not p1:
            print('密码不能为空')
            continue
        if p1 != p2:
            print('两次输入不一致，请重试')
            continue
        return p1


def main():
    existing = db_manager.get_user_by_username('admin')
    if existing:
        print('admin 用户已存在')
        ans = input('是否重置 admin 密码？(y/N): ').strip().lower()
        if ans not in ('y', 'yes'):
            print('跳过初始化')
            return

        password = _prompt_password_twice()
        ok = db_manager.update_user_password('admin', password)
        if not ok:
            raise SystemExit('重置 admin 密码失败')

        # 确保仍为管理员
        with db_manager.lock:
            cursor = db_manager.conn.cursor()
            cursor.execute("UPDATE users SET is_admin = 1 WHERE username = 'admin'")
            db_manager.conn.commit()

        print('重置完成：已更新 admin 密码')
        return

    print('=== 初始化管理员账号（CLI）===')
    email = _prompt_non_empty('请输入管理员邮箱: ')
    password = _prompt_password_twice()

    ok = db_manager.create_user('admin', email, password)
    if not ok:
        raise SystemExit('创建 admin 用户失败：用户名或邮箱可能已存在')

    # 设为管理员
    with db_manager.lock:
        cursor = db_manager.conn.cursor()
        cursor.execute("UPDATE users SET is_admin = 1 WHERE username = 'admin'")
        db_manager.conn.commit()

    print('初始化完成：已创建 admin 用户')


if __name__ == '__main__':
    main()

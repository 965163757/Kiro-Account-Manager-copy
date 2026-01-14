#!/usr/bin/env python3
"""
自动注册脚本 - 与 Kiro Account Manager 联动
1. 轮询等待设备授权 URL
2. 自动填写注册表单
3. 自动获取邮箱验证码
4. 完成注册流程
"""
import random
import sys
import time
import re
import imaplib
import email
import string
from email.header import decode_header
import requests
from DrissionPage import ChromiumPage, ChromiumOptions
from brower import RoxyClient


# ============================================================
# 配置区域
# ============================================================

# 邮箱配置
EMAIL_CONFIG = {
    "imap_server": "imap.example.com",
    "email": "your-email@example.com",
    "password": "your-password",
    "timeout": 180,  # 3分钟超时
    "poll_interval": 5,  # 每5秒检查一次
}

# 注册配置
REGISTER_CONFIG = {
    "email_prefix": "asedf",  # 邮箱前缀（会自动加随机数）
    "email_domain": "@overvmp.top",      # 邮箱域名
    "name": "advsdfq",                   # 注册名字
    "password": "Yuan1231hjv.",     # 注册密码
}

# 服务配置
SERVICE_CONFIG = {
    "base_url": "http://127.0.0.1:23847",
    "get_url_endpoint": "/get_device_auth_url",
    "start_auth_endpoint": "/start_device_auth",
    "poll_auth_endpoint": "/poll_device_auth",
    "reload_accounts_endpoint": "/reload_accounts",
    "reset_machine_id_endpoint": "/reset_machine_id",
    "status_endpoint": "/status",
    "poll_interval": 3,  # 轮询间隔（秒）
    "max_wait_time": 600,  # 最大等待时间（秒）
}

# Roxy 指纹浏览器配置
ROXY_CONFIG = {
    "port": 50000,
    "token": "5586c9a4b2b228ea5f23cec84cbc938d",
    "workspace_id": 3104,  # 工作空间 ID
    "browser_id": None,  # 浏览器窗口 ID，None 表示自动获取第一个
}


# ============================================================
# 核心函数
# ============================================================

def check_service_status():
    """检查服务是否运行"""
    try:
        response = requests.get(f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['status_endpoint']}", timeout=5)
        return response.status_code == 200
    except:
        return False


def reload_accounts():
    """通知应用重新加载账号列表"""
    try:
        response = requests.get(
            f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['reload_accounts_endpoint']}",
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        if data.get("success"):
            print(f"账号列表已刷新，共 {data.get('count', 0)} 个账号")
            return True
    except Exception as e:
        print(f"刷新账号列表失败: {e}")
    return False


def reset_machine_id():
    """
    重置机器码（为下一次注册准备新的机器码）
    :return: (success, new_machine_id) 或 (False, None)
    """
    try:
        print("正在重置机器码...")
        response = requests.get(
            f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['reset_machine_id_endpoint']}",
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        if data.get("success"):
            new_id = data.get("machineId", "")
            print(f"机器码已重置: {new_id[:16]}...")
            return True, new_id
        else:
            print(f"重置机器码失败: {data.get('error', '未知错误')}")
            return False, None
    except Exception as e:
        print(f"重置机器码请求失败: {e}")
        return False, None


def wait_for_account_saved(timeout=60, interval=3):
    """
    等待后台轮询完成并保存账号
    通过检查 /get_device_auth_url 返回 null 来判断是否完成
    :param timeout: 超时时间（秒）
    :param interval: 轮询间隔（秒）
    :return: 是否成功
    """
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            response = requests.get(
                f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['get_url_endpoint']}",
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            # 如果 URL 变成 null，说明后台轮询已完成（成功或失败）
            if data.get("url") is None:
                print("后台轮询已完成")
                # 刷新账号列表确认
                reload_accounts()
                return True

            elapsed = int(time.time() - start_time)
            print(f"\r等待后台轮询完成... ({elapsed}s)", end="", flush=True)

        except Exception as e:
            print(f"\r检查状态失败: {e}", end="", flush=True)

        time.sleep(interval)

    print("\n等待超时")
    return False


def start_device_auth():
    """
    调用接口触发设备授权流程
    :return: 授权 URL 或 None
    """
    try:
        print("正在触发设备授权流程...")
        response = requests.get(
            f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['start_auth_endpoint']}",
            timeout=60
        )
        response.raise_for_status()
        data = response.json()

        if data.get("success") and data.get("url"):
            print(f"设备授权已启动!")
            print(f"  URL: {data.get('url')}")
            print(f"  过期时间: {data.get('expires_in')}秒")
            return data.get("url")
        else:
            print(f"启动失败: {data.get('error', '未知错误')}")
            return None
    except requests.exceptions.ConnectionError:
        print("服务未启动，请先启动 Kiro Account Manager")
        return None
    except requests.exceptions.RequestException as e:
        print(f"请求错误: {e}")
        return None


def poll_device_auth(timeout=300, interval=5):
    """
    轮询设备授权状态，等待用户完成授权
    :param timeout: 超时时间（秒）
    :param interval: 轮询间隔（秒）
    :return: (success, email) 或 (False, None)
    """
    print("\n等待授权完成...")
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            response = requests.get(
                f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['poll_auth_endpoint']}",
                timeout=30
            )
            response.raise_for_status()
            data = response.json()

            status = data.get("status")

            if status == "success":
                email = data.get("email", "unknown")
                account_id = data.get("account_id", "")
                machine_id_reset = data.get("machine_id_reset", False)
                new_machine_id = data.get("new_machine_id", "")

                print(f"\n授权成功! 账号已保存: {email}")

                # 显示机器码重置状态
                if machine_id_reset and new_machine_id:
                    print(f"机器码已自动重置: {new_machine_id[:16]}...")
                elif not machine_id_reset:
                    print("警告: 机器码重置失败，建议手动重置")

                # 通知应用刷新账号列表
                reload_accounts()
                return True, email

            elif status == "pending":
                elapsed = int(time.time() - start_time)
                print(f"\r等待用户授权... ({elapsed}s)", end="", flush=True)

            elif status == "slow_down":
                interval = min(interval + 2, 15)  # 增加间隔
                print(f"\r请求过快，降速... (间隔: {interval}s)", end="", flush=True)

            elif status == "expired":
                print("\n授权已过期")
                return False, None

            elif status == "denied":
                print("\n授权被拒绝")
                return False, None

            elif status == "error":
                print(f"\n轮询错误: {data.get('error')}")
                return False, None

        except requests.exceptions.RequestException as e:
            print(f"\r轮询请求失败: {e}", end="", flush=True)

        time.sleep(interval)

    print("\n轮询超时")
    return False, None


def wait_for_device_auth_url(max_wait=600, poll_interval=3):
    """
    轮询等待设备授权 URL
    :param max_wait: 最大等待时间（秒）
    :param poll_interval: 轮询间隔（秒）
    :return: URL 或 None
    """
    print("=" * 50)
    print("等待设备授权 URL...")
    print("=" * 50)

    start_time = time.time()

    while time.time() - start_time < max_wait:
        try:
            response = requests.get(
                f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['get_url_endpoint']}",
                timeout=5
            )
            response.raise_for_status()
            data = response.json()
            url = data.get("url")

            if url:
                print(f"\n获取到设备授权 URL!")
                return url
            else:
                elapsed = int(time.time() - start_time)
                print(f"\r等待中... ({elapsed}s)", end="", flush=True)

        except requests.exceptions.ConnectionError:
            print(f"\r服务未启动，等待连接...", end="", flush=True)
        except requests.exceptions.RequestException as e:
            print(f"\r请求错误: {e}", end="", flush=True)

        time.sleep(poll_interval)

    print("\n等待超时")
    return None


def get_verification_code_from_email(timeout=180, poll_interval=5):
    """
    从邮箱获取 AWS 验证码
    :param timeout: 超时时间（秒）
    :param poll_interval: 轮询间隔（秒）
    :return: 验证码或 None
    """
    from email.utils import parsedate_to_datetime
    from datetime import datetime, timezone

    print(f"\n正在连接邮箱服务器 {EMAIL_CONFIG['imap_server']}...")

    start_time = time.time()
    checked_ids = set()  # 已检查过的邮件 ID
    max_email_age = 180  # 邮件最大有效时间：3分钟

    # AWS 验证码邮件的特征
    aws_senders = ["no-reply@signin.aws", "no-reply@verify.signin.aws", "aws", "amazon"]
    aws_subjects = ["verification", "verify", "code", "aws", "amazon", "builder"]

    while time.time() - start_time < timeout:
        try:
            # 连接 IMAP 服务器
            mail = imaplib.IMAP4_SSL(EMAIL_CONFIG["imap_server"])
            mail.login(EMAIL_CONFIG["email"], EMAIL_CONFIG["password"])

            # 选择收件箱，获取邮件数量
            status, data = mail.select("INBOX")
            if status != "OK":
                print("选择收件箱失败")
                mail.logout()
                time.sleep(poll_interval)
                continue

            # 获取邮件总数
            email_count = int(data[0].decode())

            if email_count == 0:
                print("邮箱为空，等待新邮件...")
                mail.logout()
                time.sleep(poll_interval)
                continue

            # 从最新的邮件开始检查（最多检查最近 10 封）
            start_idx = max(1, email_count - 9)
            for mail_idx in range(email_count, start_idx - 1, -1):
                mail_id = str(mail_idx)

                # 跳过已检查过的邮件
                if mail_id in checked_ids:
                    continue

                # 获取邮件内容
                status, msg_data = mail.fetch(mail_id, "(RFC822)")
                if status != "OK":
                    continue

                # 解析邮件
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                # 检查邮件时间
                email_date_str = msg["Date"]
                if email_date_str:
                    try:
                        email_date = parsedate_to_datetime(email_date_str)
                        now = datetime.now(timezone.utc)
                        age_seconds = (now - email_date).total_seconds()

                        if age_seconds > max_email_age:
                            checked_ids.add(mail_id)
                            continue  # 跳过太旧的邮件
                    except:
                        pass

                # 获取发件人
                sender = msg.get("From", "").lower()

                # 获取邮件主题
                subject = msg["Subject"] or ""
                if subject:
                    decoded_subject = decode_header(subject)[0]
                    if isinstance(decoded_subject[0], bytes):
                        subject = decoded_subject[0].decode(decoded_subject[1] or "utf-8")
                    else:
                        subject = decoded_subject[0]

                subject_lower = subject.lower()

                # 检查是否是 AWS 相关邮件
                is_aws_email = (
                    any(s in sender for s in aws_senders) or
                    any(s in subject_lower for s in aws_subjects)
                )

                if not is_aws_email:
                    print(f"跳过非 AWS 邮件: {subject[:50]}...")
                    checked_ids.add(mail_id)
                    continue

                print(f"找到 AWS 邮件: {subject}")

                # 获取邮件正文
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        if content_type == "text/plain" or content_type == "text/html":
                            try:
                                charset = part.get_content_charset() or "utf-8"
                                body = part.get_payload(decode=True).decode(charset, errors="ignore")
                                break
                            except:
                                continue
                else:
                    try:
                        charset = msg.get_content_charset() or "utf-8"
                        body = msg.get_payload(decode=True).decode(charset, errors="ignore")
                    except:
                        pass

                # 从邮件内容中提取验证码（6位数字）
                # 优先匹配更精确的模式
                patterns = [
                    r'verification code[:\s]+(\d{6})',
                    r'code[:\s]+(\d{6})',
                    r'验证码[：:\s]*(\d{6})',
                    r'>(\d{6})<',  # HTML 中的验证码
                    r'\s(\d{6})\s',  # 空格包围的 6 位数字
                ]

                for pattern in patterns:
                    match = re.search(pattern, body, re.IGNORECASE)
                    if match:
                        code = match.group(1)
                        print(f"找到验证码: {code}")
                        mail.logout()
                        return code

                # 如果上面的模式都没匹配到，尝试找第一个 6 位数字
                match = re.search(r'(\d{6})', body)
                if match:
                    code = match.group(1)
                    print(f"找到验证码: {code}")
                    mail.logout()
                    return code

                checked_ids.add(mail_id)
                print("未在邮件中找到验证码")

            mail.logout()

        except imaplib.IMAP4.error as e:
            print(f"IMAP 错误: {e}")
        except Exception as e:
            print(f"获取邮件出错: {e}")

        elapsed = int(time.time() - start_time)
        print(f"等待验证码邮件... ({elapsed}s/{timeout}s)")
        time.sleep(poll_interval)

    print("获取验证码超时")
    return None


def generate_random_email():
    """生成随机邮箱地址"""
    random_suffix = ''.join(random.choices(string.digits, k=8))
    return f"{REGISTER_CONFIG['email_prefix']}{random_suffix}{REGISTER_CONFIG['email_domain']}"


def generate_random_name():
    """生成随机英文名字"""
    first_names = [
        "James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph",
        "Thomas", "Charles", "Mary", "Patricia", "Jennifer", "Linda", "Elizabeth",
        "Barbara", "Susan", "Jessica", "Sarah", "Karen", "Alex", "Sam", "Taylor",
        "Jordan", "Morgan", "Casey", "Riley", "Quinn", "Avery", "Parker"
    ]
    last_names = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
        "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson",
        "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Young"
    ]
    return f"{random.choice(first_names)} {random.choice(last_names)}"


def generate_random_password(length=14):
    """
    生成随机密码
    :param length: 密码长度（默认14位）
    :return: 符合要求的密码（包含大小写字母、数字、特殊字符）
    """
    # 确保包含各类字符
    lowercase = random.choice(string.ascii_lowercase)
    uppercase = random.choice(string.ascii_uppercase)
    digit = random.choice(string.digits)
    special = random.choice("!@#$%^&*.")

    # 剩余字符随机选择
    remaining_length = length - 4
    all_chars = string.ascii_letters + string.digits + "!@#$%^&*."
    remaining = ''.join(random.choices(all_chars, k=remaining_length))

    # 混合所有字符并打乱顺序
    password_chars = list(lowercase + uppercase + digit + special + remaining)
    random.shuffle(password_chars)

    return ''.join(password_chars)


# 全局变量，保存当前浏览器信息
_current_browser_info = {
    "client": None,
    "dir_id": None,
}


def open_browser(url):
    """
    使用 Roxy 指纹浏览器打开页面
    :param url: 要打开的 URL
    :return: DrissionPage 页面对象
    """
    global _current_browser_info

    print("正在连接 Roxy 指纹浏览器...")

    # 创建 Roxy 客户端
    client = RoxyClient(port=ROXY_CONFIG["port"], token=ROXY_CONFIG["token"])

    # 检查服务是否运行
    try:
        health = client.health()
        if health.get("code") != 0:
            raise Exception(f"Roxy 服务异常: {health}")
        print("Roxy 服务正常运行")
    except requests.exceptions.ConnectionError:
        raise Exception("无法连接 Roxy 服务，请确保 Roxy 浏览器已启动")

    # 获取浏览器窗口 ID
    browser_id = ROXY_CONFIG.get("browser_id")
    workspace_id = ROXY_CONFIG["workspace_id"]

    if not browser_id:
        # 自动获取第一个浏览器窗口
        print("正在获取浏览器窗口列表...")
        workspace_id = client.workspace_project()['data']['rows'][0]['id']
        browser_list = client.browser_list(workspace_id, page_size=999)
        if browser_list.get("code") != 0:
            raise Exception(f"获取浏览器列表失败: {browser_list}")

        rows = browser_list.get("data", {}).get("rows", [])
        if not rows:
            raise Exception("没有找到可用的浏览器窗口，请先在 Roxy 中创建一个窗口")

        browser_id = rows[0]["dirId"]
        print(f"使用浏览器窗口: {browser_id}")

    # 随机化指纹
    print("正在随机化浏览器指纹...")
    random_result = client.browser_random_env(workspace_id, browser_id)
    if random_result.get("code") == 0:
        print("浏览器指纹已随机化")
    else:
        print(f"警告: 指纹随机化失败: {random_result.get('msg', '未知错误')}")

    # 打开浏览器窗口
    print("正在打开浏览器窗口...")
    open_result = client.browser_open(browser_id)
    if open_result.get("code") != 0:
        raise Exception(f"打开浏览器失败: {open_result.get('msg', '未知错误')}")

    # 获取调试端口
    browser_data = open_result.get("data", {})
    debug_port = browser_data.get("http", "")  # 格式: 127.0.0.1:xxxxx

    if not debug_port:
        raise Exception("无法获取浏览器调试端口")

    print(f"浏览器调试端口: {debug_port}")

    # 保存当前浏览器信息
    _current_browser_info["client"] = client
    _current_browser_info["dir_id"] = browser_id

    # 等待浏览器启动
    time.sleep(2)

    # 使用 DrissionPage 接管浏览器
    options = ChromiumOptions()
    options.set_local_port(int(debug_port.split(":")[-1]))

    page = ChromiumPage(options)
    page.get(url)

    print(f"浏览器已打开: {page.title}")
    return page


def close_browser(page):
    """
    关闭 Roxy 指纹浏览器窗口
    :param page: DrissionPage 页面对象
    """
    global _current_browser_info

    try:
        # 先断开 DrissionPage 连接
        if page:
            try:
                page.quit()
            except:
                pass

        # 关闭 Roxy 浏览器窗口
        client = _current_browser_info.get("client")
        dir_id = _current_browser_info.get("dir_id")

        if client and dir_id:
            print("正在关闭 Roxy 浏览器窗口...")
            close_result = client.browser_close(dir_id)
            if close_result.get("code") == 0:
                print("浏览器窗口已关闭")
            else:
                print(f"警告: 关闭浏览器失败: {close_result.get('msg', '未知错误')}")

        # 清理全局状态
        _current_browser_info["client"] = None
        _current_browser_info["dir_id"] = None

    except Exception as e:
        print(f"关闭浏览器出错: {e}")


def auto_register(page, register_email):
    """
    自动填写注册表单
    :param page: DrissionPage 页面对象
    :param register_email: 注册邮箱
    :return: (是否成功, 密码)
    """
    # 生成随机名字和密码
    random_name = generate_random_name()
    random_password = generate_random_password()

    try:
        print(f"\n开始自动注册流程...")
        print(f"注册邮箱: {register_email}")
        print(f"注册名字: {random_name}")
        print(f"注册密码: {random_password}")

        # Step 1: 输入邮箱
        print("Step 1: 输入邮箱...")
        page.ele("@placeholder=username@example.com").input(register_email)
        time.sleep(0.5)
        page.ele("继续").click()
        time.sleep(2)

        # Step 2: 输入名字
        print("Step 2: 输入名字...")
        page.ele("@placeholder=Maria José Silva").input(random_name)
        time.sleep(0.5)
        page.ele("继续").click()
        time.sleep(2)

        # Step 3: 获取验证码
        print("Step 3: 等待验证码...")
        code = get_verification_code_from_email(
            timeout=EMAIL_CONFIG["timeout"],
            poll_interval=EMAIL_CONFIG["poll_interval"]
        )

        if not code:
            print("未能获取验证码，注册失败")
            return False, None

        # Step 4: 输入验证码
        print("Step 4: 输入验证码...")
        page.ele("@placeholder=6 位数").input(code)
        time.sleep(0.5)
        page.ele("Continue").click()
        time.sleep(2)

        # Step 5: 设置密码
        print("Step 5: 设置密码...")
        page.ele("@placeholder=Enter password").input(random_password)
        page.ele("@placeholder=Re-enter password").input(random_password)
        time.sleep(0.5)
        page.ele("继续").click()
        time.sleep(2)

        # Step 6: 确认
        print("Step 6: 确认...")
        page.ele("Confirm and continue").click()
        time.sleep(2)

        # Step 7: 允许访问
        print("Step 7: 授权访问...")
        allow_buttons = page.eles("Allow access")
        if len(allow_buttons) > 1:
            allow_buttons[1].click()
        elif allow_buttons:
            allow_buttons[0].click()

        time.sleep(3)

        # Step 8: 等待后台自动保存账号（后台轮询已自动启动）
        print("\nStep 8: 等待账号保存（后台自动轮询中）...")
        success = wait_for_account_saved(timeout=60)

        if success:
            print(f"\n注册流程完成!")
            return True, random_password
        else:
            print("\n注册流程完成，但账号保存超时")
            return False, None

    except Exception as e:
        print(f"注册过程出错: {e}")
        return False, None


def run_auto_register():
    """
    运行自动注册流程（完全自动化）
    """
    print("\n" + "=" * 50)
    print("Kiro 自动注册脚本（完全自动化）")
    print("=" * 50)

    # Step 1: 检查服务状态
    print("\n检查服务状态...")
    if not check_service_status():
        print("错误: Kiro Account Manager 未运行，请先启动应用")
        return False

    print("服务正常运行")

    # Step 2: 触发设备授权
    url = start_device_auth()
    # url = "https://view.awsapps.com/start/#/device?user_code=BDJX-JHPX"
    if not url:
        print("未能获取设备授权 URL，退出")
        return False

    # Step 3: 打开浏览器
    print(f"\n打开授权页面: {url}")
    page = open_browser(url)
    time.sleep(3)

    # Step 4: 生成随机邮箱
    register_email = generate_random_email()

    # Step 5: 自动注册
    success, password = auto_register(page, register_email)

    if success:
        print("\n" + "=" * 50)
        print("注册成功!")
        print(f"邮箱: {register_email}")
        print(f"密码: {password}")
        print("=" * 50)

        # 等待用户确认
        print("\n按 Ctrl+C 退出...")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    else:
        print("\n注册失败")

    close_browser(page)
    return success


def run_loop_register(count=1, interval=10):
    """
    循环注册多个账号（完全自动化）
    :param count: 注册数量
    :param interval: 每次注册间隔（秒）
    """
    print(f"\n准备注册 {count} 个账号...")

    # 检查服务状态
    print("\n检查服务状态...")
    if not check_service_status():
        print("错误: Kiro Account Manager 未运行，请先启动应用")
        return []

    print("服务正常运行")

    success_count = 0
    failed_count = 0
    registered_accounts = []

    for i in range(count):
        print(f"\n{'='*50}")
        print(f"正在注册第 {i+1}/{count} 个账号")
        print(f"{'='*50}")

        # 触发设备授权
        url = start_device_auth()
        # url = "https://view.awsapps.com/start/#/device?user_code=QFBZ-LJHT"
        if not url:
            print("未获取到 URL，跳过")
            failed_count += 1
            continue

        # 打开浏览器
        page = open_browser(url)
        time.sleep(3)

        # 生成邮箱
        register_email = generate_random_email()

        # 注册
        success, password = auto_register(page, register_email)

        if success:
            success_count += 1
            registered_accounts.append({
                "email": register_email,
                "password": password
            })
            print(f"第 {i+1} 个账号注册成功!")
        else:
            failed_count += 1
            print(f"第 {i+1} 个账号注册失败")

        close_browser(page)

        # 间隔
        if i < count - 1:
            print(f"\n等待 {interval} 秒后继续...")
            time.sleep(interval)

    # 打印结果
    print("\n" + "=" * 50)
    print("注册完成!")
    print(f"成功: {success_count}, 失败: {failed_count}")
    print("=" * 50)

    if registered_accounts:
        print("\n已注册账号:")
        for acc in registered_accounts:
            print(f"  邮箱: {acc['email']}")
            print(f"  密码: {acc['password']}")
            print()

    return registered_accounts


# ============================================================
# 主入口
# ============================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Kiro 自动注册脚本")
    parser.add_argument("--loop", type=int, default=1, help="注册账号数量")
    parser.add_argument("--interval", type=int, default=10, help="每次注册间隔（秒）")
    args = parser.parse_args()

    if args.loop > 1:
        run_loop_register(count=args.loop, interval=args.interval)
    else:
        run_auto_register()

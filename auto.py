#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动注册脚本 - 与 Kiro Account Manager 联动
1. 轮询等待设备授权 URL
2. 自动填写注册表单
3. 自动获取邮箱验证码
4. 完成注册流程

支持两种浏览器模式：
- Chrome 隐私模式（推荐）
- Roxy 指纹浏览器
"""
import random
import sys
import os
import io
import time
import re
import imaplib
import email
import string
import subprocess

# 设置 stdout/stderr 编码为 UTF-8（Windows 兼容）并禁用缓冲
if sys.platform == 'win32':
    # 使用 line_buffering=True 确保每行都立即输出
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace', line_buffering=True)
import platform
from email.header import decode_header

# 检查必需的依赖
try:
    import requests
except ImportError:
    print("错误: 缺少 requests 模块，请运行: pip install requests")
    sys.exit(1)

try:
    from DrissionPage import ChromiumPage, ChromiumOptions
except ImportError:
    print("错误: 缺少 DrissionPage 模块，请运行: pip install DrissionPage")
    sys.exit(1)

# 尝试导入 Roxy 客户端（可选）
try:
    from brower import RoxyClient
    ROXY_AVAILABLE = True
except ImportError:
    ROXY_AVAILABLE = False


# ============================================================
# 配置区域 - 通过环境变量或命令行参数设置
# ============================================================

import os

# 邮箱配置
EMAIL_CONFIG = {
    "imap_server": os.getenv("EMAIL_IMAP_SERVER", "imap.example.com"),
    "email": os.getenv("EMAIL_ADDRESS", "your-email@example.com"),
    "password": os.getenv("EMAIL_PASSWORD", "your-password"),
    "timeout": int(os.getenv("EMAIL_TIMEOUT", "180")),
    "poll_interval": int(os.getenv("EMAIL_POLL_INTERVAL", "5")),
}

# 注册配置
REGISTER_CONFIG = {
    "email_prefix": os.getenv("EMAIL_PREFIX", "user"),
    "email_domain": os.getenv("EMAIL_DOMAIN", "@example.com"),
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
    "poll_interval": 3,
    "max_wait_time": 600,
}

# 浏览器配置（运行时设置）
BROWSER_CONFIG = {
    "type": "chrome",  # "chrome" 或 "roxy"
    "chrome_path": None,
    "debug_port": 3522,
    # 代理配置
    "proxy_enabled": False,
    "proxy_type": "http",
    "proxy_host": "",
    "proxy_port": 8080,
    "proxy_user": None,
    "proxy_pass": None,
    # Roxy 配置
    "roxy_port": 50000,
    "roxy_token": None,
    "roxy_workspace_id": None,
    "roxy_browser_id": None,
}


# ============================================================
# Chrome 浏览器相关函数
# ============================================================

def detect_chrome_path():
    """自动检测 Chrome 浏览器路径"""
    system = platform.system()
    
    if system == "Windows":
        paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
    elif system == "Darwin":  # macOS
        paths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        ]
    else:  # Linux
        paths = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
        ]
    
    for path in paths:
        if os.path.exists(path):
            return path
    
    return None


def find_available_port(start=9222, end=9322):
    """查找可用端口"""
    import socket
    for port in range(start, end):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(('127.0.0.1', port))
            sock.close()
            return port
        except OSError:
            continue
    return start


def open_chrome_incognito(url):
    """
    使用 Chrome 隐私模式打开页面
    :param url: 要打开的 URL
    :return: (DrissionPage 页面对象, Chrome 进程)
    """
    chrome_path = BROWSER_CONFIG.get("chrome_path") or detect_chrome_path()
    if not chrome_path:
        raise Exception("未找到 Chrome 浏览器，请手动指定路径")
    
    print(f"使用 Chrome: {chrome_path}")
    
    # 查找可用端口
    debug_port = find_available_port()
    BROWSER_CONFIG["debug_port"] = debug_port
    print(f"调试端口: {debug_port}")
    
    # 创建临时用户数据目录（避免与现有 Chrome 实例冲突）
    import tempfile
    user_data_dir = tempfile.mkdtemp(prefix="chrome_auto_")
    print(f"临时用户目录: {user_data_dir}")
    
    # 构建启动参数
    args = [
        chrome_path,
        "--incognito",
        f"--remote-debugging-port={debug_port}",
        f"--user-data-dir={user_data_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-hang-monitor",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--disable-features=TranslateUI",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows",
        "--metrics-recording-only",
        "--safebrowsing-disable-auto-update",
        "--password-store=basic",
        "--use-mock-keychain",
        "--enable-features=NetworkService,NetworkServiceInProcess",
    ]
    
    # 代理配置
    if BROWSER_CONFIG.get("proxy_enabled"):
        proxy_type = BROWSER_CONFIG.get("proxy_type", "http")
        proxy_host = BROWSER_CONFIG.get("proxy_host", "")
        proxy_port = BROWSER_CONFIG.get("proxy_port", 8080)
        
        if proxy_host:
            if proxy_type == "socks5":
                proxy_server = f"socks5://{proxy_host}:{proxy_port}"
            elif proxy_type == "https":
                proxy_server = f"https://{proxy_host}:{proxy_port}"
            else:
                proxy_server = f"http://{proxy_host}:{proxy_port}"
            
            args.append(f"--proxy-server={proxy_server}")
            print(f"使用代理: {proxy_server}")
    
    # 添加 URL
    args.append(url)
    
    # 启动 Chrome
    print("正在启动 Chrome 隐私模式...")
    
    # 根据平台选择启动方式
    if platform.system() == "Windows":
        process = subprocess.Popen(args, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    else:
        process = subprocess.Popen(args, start_new_session=True)
    
    # 保存临时目录路径以便后续清理
    _current_browser_info["user_data_dir"] = user_data_dir
    
    # 等待浏览器启动
    time.sleep(3)
    
    # 使用 DrissionPage 接管浏览器
    options = ChromiumOptions()
    options.set_local_port(debug_port)
    
    page = ChromiumPage(options)
    print(f"Chrome 已打开: {page.title}")
    
    return page, process


def close_chrome(page, process):
    """关闭 Chrome 浏览器"""
    import shutil
    
    try:
        if page:
            try:
                page.quit()
            except:
                pass
        
        if process:
            print("正在关闭 Chrome...")
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
            print("Chrome 已关闭")
        
        # 清理临时用户数据目录
        user_data_dir = _current_browser_info.get("user_data_dir")
        if user_data_dir and os.path.exists(user_data_dir):
            try:
                time.sleep(1)  # 等待 Chrome 完全关闭
                shutil.rmtree(user_data_dir, ignore_errors=True)
                print(f"已清理临时目录: {user_data_dir}")
            except Exception as e:
                print(f"清理临时目录失败: {e}")
            _current_browser_info["user_data_dir"] = None
    except Exception as e:
        print(f"关闭 Chrome 出错: {e}")


# ============================================================
# Roxy 指纹浏览器相关函数
# ============================================================

# 全局变量，保存当前浏览器信息
_current_browser_info = {
    "client": None,
    "dir_id": None,
    "process": None,
    "user_data_dir": None,
}


def open_roxy_browser(url):
    """
    使用 Roxy 指纹浏览器打开页面
    :param url: 要打开的 URL
    :return: DrissionPage 页面对象
    """
    global _current_browser_info
    
    if not ROXY_AVAILABLE:
        raise Exception("Roxy 客户端不可用，请安装 brower.py")
    
    print("正在连接 Roxy 指纹浏览器...")
    
    # 创建 Roxy 客户端
    port = BROWSER_CONFIG.get("roxy_port", 50000)
    token = BROWSER_CONFIG.get("roxy_token", "")
    client = RoxyClient(port=port, token=token)
    
    # 检查服务是否运行
    try:
        health = client.health()
        if health.get("code") != 0:
            raise Exception(f"Roxy 服务异常: {health}")
        print("Roxy 服务正常运行")
    except requests.exceptions.ConnectionError:
        raise Exception("无法连接 Roxy 服务，请确保 Roxy 浏览器已启动")
    
    # 获取浏览器窗口 ID
    browser_id = BROWSER_CONFIG.get("roxy_browser_id")
    workspace_id = BROWSER_CONFIG.get("roxy_workspace_id")
    
    if not browser_id:
        print("正在获取浏览器窗口列表...")
        workspace_data = client.workspace_project()
        if workspace_data.get("code") != 0:
            raise Exception(f"获取工作空间失败: {workspace_data}")
        
        workspace_id = workspace_data['data']['rows'][0]['id']
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
    debug_port = browser_data.get("http", "")
    
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


def close_roxy_browser(page):
    """关闭 Roxy 指纹浏览器窗口"""
    global _current_browser_info
    
    try:
        if page:
            try:
                page.quit()
            except:
                pass
        
        client = _current_browser_info.get("client")
        dir_id = _current_browser_info.get("dir_id")
        
        if client and dir_id:
            print("正在关闭 Roxy 浏览器窗口...")
            close_result = client.browser_close(dir_id)
            if close_result.get("code") == 0:
                print("浏览器窗口已关闭")
            else:
                print(f"警告: 关闭浏览器失败: {close_result.get('msg', '未知错误')}")
        
        _current_browser_info["client"] = None
        _current_browser_info["dir_id"] = None
    except Exception as e:
        print(f"关闭浏览器出错: {e}")


# ============================================================
# 统一浏览器接口
# ============================================================

def open_browser(url):
    """
    打开浏览器（根据配置选择 Chrome 或 Roxy）
    :param url: 要打开的 URL
    :return: DrissionPage 页面对象
    """
    browser_type = BROWSER_CONFIG.get("type", "chrome")
    
    if browser_type == "roxy":
        page = open_roxy_browser(url)
        _current_browser_info["process"] = None
        return page
    else:
        page, process = open_chrome_incognito(url)
        _current_browser_info["process"] = process
        return page


def close_browser(page):
    """关闭浏览器"""
    browser_type = BROWSER_CONFIG.get("type", "chrome")
    
    if browser_type == "roxy":
        close_roxy_browser(page)
    else:
        close_chrome(page, _current_browser_info.get("process"))
        _current_browser_info["process"] = None



# ============================================================
# 服务通信函数
# ============================================================

def check_service_status():
    """检查服务是否运行"""
    try:
        response = requests.get(
            f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['status_endpoint']}", 
            timeout=5
        )
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


def start_device_auth():
    """触发设备授权流程"""
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


def wait_for_account_saved(timeout=60, interval=3):
    """等待后台轮询完成并保存账号"""
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            response = requests.get(
                f"{SERVICE_CONFIG['base_url']}{SERVICE_CONFIG['get_url_endpoint']}",
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            if data.get("url") is None:
                print("后台轮询已完成")
                reload_accounts()
                return True
            
            elapsed = int(time.time() - start_time)
            print(f"\r等待后台轮询完成... ({elapsed}s)", end="", flush=True)
        except Exception as e:
            print(f"\r检查状态失败: {e}", end="", flush=True)
        
        time.sleep(interval)
    
    print("\n等待超时")
    return False


# ============================================================
# 邮箱验证码获取
# ============================================================

def get_verification_code_from_email(timeout=180, poll_interval=5):
    """从邮箱获取 AWS 验证码"""
    from email.utils import parsedate_to_datetime
    from datetime import datetime, timezone
    
    print(f"\n正在连接邮箱服务器 {EMAIL_CONFIG['imap_server']}...")
    
    start_time = time.time()
    checked_ids = set()
    max_email_age = 180
    
    aws_senders = ["no-reply@signin.aws", "no-reply@verify.signin.aws", "aws", "amazon"]
    aws_subjects = ["verification", "verify", "code", "aws", "amazon", "builder"]
    
    while time.time() - start_time < timeout:
        try:
            mail = imaplib.IMAP4_SSL(EMAIL_CONFIG["imap_server"])
            mail.login(EMAIL_CONFIG["email"], EMAIL_CONFIG["password"])
            
            status, data = mail.select("INBOX")
            if status != "OK":
                print("选择收件箱失败")
                mail.logout()
                time.sleep(poll_interval)
                continue
            
            email_count = int(data[0].decode())
            
            if email_count == 0:
                print("邮箱为空，等待新邮件...")
                mail.logout()
                time.sleep(poll_interval)
                continue
            
            start_idx = max(1, email_count - 9)
            for mail_idx in range(email_count, start_idx - 1, -1):
                mail_id = str(mail_idx)
                
                if mail_id in checked_ids:
                    continue
                
                status, msg_data = mail.fetch(mail_id, "(RFC822)")
                if status != "OK":
                    continue
                
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                email_date_str = msg["Date"]
                if email_date_str:
                    try:
                        email_date = parsedate_to_datetime(email_date_str)
                        now = datetime.now(timezone.utc)
                        age_seconds = (now - email_date).total_seconds()
                        
                        if age_seconds > max_email_age:
                            checked_ids.add(mail_id)
                            continue
                    except:
                        pass
                
                sender = msg.get("From", "").lower()
                
                subject = msg["Subject"] or ""
                if subject:
                    decoded_subject = decode_header(subject)[0]
                    if isinstance(decoded_subject[0], bytes):
                        subject = decoded_subject[0].decode(decoded_subject[1] or "utf-8")
                    else:
                        subject = decoded_subject[0]
                
                subject_lower = subject.lower()
                
                is_aws_email = (
                    any(s in sender for s in aws_senders) or
                    any(s in subject_lower for s in aws_subjects)
                )
                
                if not is_aws_email:
                    checked_ids.add(mail_id)
                    continue
                
                print(f"找到 AWS 邮件: {subject}")
                
                body = ""
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        if content_type in ["text/plain", "text/html"]:
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
                
                patterns = [
                    r'verification code[:\s]+(\d{6})',
                    r'code[:\s]+(\d{6})',
                    r'验证码[：:\s]*(\d{6})',
                    r'>(\d{6})<',
                    r'\s(\d{6})\s',
                ]
                
                for pattern in patterns:
                    match = re.search(pattern, body, re.IGNORECASE)
                    if match:
                        code = match.group(1)
                        print(f"找到验证码: {code}")
                        mail.logout()
                        return code
                
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


# ============================================================
# 随机数据生成
# ============================================================

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
    """生成随机密码"""
    lowercase = random.choice(string.ascii_lowercase)
    uppercase = random.choice(string.ascii_uppercase)
    digit = random.choice(string.digits)
    special = random.choice("!@#$%^&*.")
    
    remaining_length = length - 4
    all_chars = string.ascii_letters + string.digits + "!@#$%^&*."
    remaining = ''.join(random.choices(all_chars, k=remaining_length))
    
    password_chars = list(lowercase + uppercase + digit + special + remaining)
    random.shuffle(password_chars)
    
    return ''.join(password_chars)


# ============================================================
# 自动注册流程
# ============================================================

def auto_register(page, register_email):
    """自动填写注册表单"""
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
        try:
            allow_buttons = page.eles("Allow access")
            print(f"tage len{len(allow_buttons)}")
            if len(allow_buttons) > 1:
                try:
                    allow_buttons[1].click()
                except:
                    allow_buttons[0].click()
                    pass
            elif allow_buttons:
                try:
                    allow_buttons[0].click()
                except:
                    allow_buttons[1].click()
                    pass
        except Exception as e:
            print(f"错误信息：{e}")
            time.sleep(10)
        
        time.sleep(3)
        
        # Step 8: 等待后台保存
        print("\nStep 8: 等待账号保存...")
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
    """运行自动注册流程"""
    print("\n" + "=" * 50)
    print("Kiro 自动注册脚本")
    print(f"浏览器模式: {BROWSER_CONFIG['type']}")
    print("=" * 50)
    
    # 打印配置信息用于调试
    print("\n[调试] 邮箱配置:")
    print(f"  IMAP服务器: {EMAIL_CONFIG['imap_server']}")
    print(f"  邮箱地址: {EMAIL_CONFIG['email']}")
    print(f"  密码: {'***' if EMAIL_CONFIG['password'] else '(空)'}")
    print(f"\n[调试] 注册配置:")
    print(f"  邮箱前缀: {REGISTER_CONFIG['email_prefix']}")
    print(f"  邮箱域名: {REGISTER_CONFIG['email_domain']}")
    
    # 检查服务状态
    print("\n检查服务状态...")
    if not check_service_status():
        print("错误: Kiro Account Manager 未运行，请先启动应用")
        return False
    
    print("服务正常运行")
    
    # 触发设备授权
    url = start_device_auth()
    if not url:
        print("未能获取设备授权 URL，退出")
        return False
    
    # 打开浏览器
    print(f"\n打开授权页面: {url}")
    page = open_browser(url)
    time.sleep(3)
    
    # 生成随机邮箱
    register_email = generate_random_email()
    
    # 自动注册
    success, password = auto_register(page, register_email)
    
    if success:
        print("\n" + "=" * 50)
        print("注册成功!")
        print(f"邮箱: {register_email}")
        print(f"密码: {password}")
        print("=" * 50)
    else:
        print("\n注册失败")
    
    close_browser(page)
    return success


def run_loop_register(count=1, interval=10):
    """循环注册多个账号"""
    print(f"\n准备注册 {count} 个账号...")
    
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
        
        url = start_device_auth()
        if not url:
            print("未获取到 URL，跳过")
            failed_count += 1
            continue
        
        page = open_browser(url)
        time.sleep(3)
        
        register_email = generate_random_email()
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
        
        if i < count - 1:
            print(f"\n等待 {interval} 秒后继续...")
            time.sleep(interval)
    
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
    
    # 基本参数
    parser.add_argument("--loop", type=int, default=1, help="注册账号数量")
    parser.add_argument("--interval", type=int, default=10, help="每次注册间隔（秒）")
    
    # 浏览器参数
    parser.add_argument("--browser-type", type=str, default="chrome", 
                        choices=["chrome", "roxy"], help="浏览器类型")
    parser.add_argument("--chrome-path", type=str, help="Chrome 可执行文件路径")
    
    # 代理参数
    parser.add_argument("--proxy-enabled", type=str, default="false", help="是否启用代理")
    parser.add_argument("--proxy-type", type=str, default="http", 
                        choices=["http", "https", "socks5"], help="代理类型")
    parser.add_argument("--proxy-host", type=str, default="", help="代理服务器地址")
    parser.add_argument("--proxy-port", type=int, default=8080, help="代理端口")
    parser.add_argument("--proxy-user", type=str, help="代理用户名")
    parser.add_argument("--proxy-pass", type=str, help="代理密码")
    
    # Roxy 参数
    parser.add_argument("--roxy-port", type=int, default=50000, help="Roxy API 端口")
    parser.add_argument("--roxy-token", type=str, help="Roxy API Token")
    
    args = parser.parse_args()
    
    # 更新配置
    BROWSER_CONFIG["type"] = args.browser_type
    BROWSER_CONFIG["chrome_path"] = args.chrome_path
    BROWSER_CONFIG["proxy_enabled"] = args.proxy_enabled.lower() == "true"
    BROWSER_CONFIG["proxy_type"] = args.proxy_type
    BROWSER_CONFIG["proxy_host"] = args.proxy_host
    BROWSER_CONFIG["proxy_port"] = args.proxy_port
    BROWSER_CONFIG["proxy_user"] = args.proxy_user
    BROWSER_CONFIG["proxy_pass"] = args.proxy_pass
    BROWSER_CONFIG["roxy_port"] = args.roxy_port
    BROWSER_CONFIG["roxy_token"] = args.roxy_token
    
    # 运行
    if args.loop > 1:
        run_loop_register(count=args.loop, interval=args.interval)
    else:
        run_auto_register()

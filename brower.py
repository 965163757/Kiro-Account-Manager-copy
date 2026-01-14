"""
@FileName：poxyBrowser.py
@Description：
@Author：yuanzhil
@Time：2024/12/26 14:00
"""
import requests
import json
import time


class RoxyClient:
    '''
    :param port: api服务的端口号
    :param token: api服务的token
    '''

    def __init__(self, port=50000, token='b93b728dbce217647ef16db6e26ad463') -> None:
        self.port = port
        self.host = "127.0.0.1"
        self.token = token
        self.url = f"http://{self.host}:{self.port}"

    def _build_headers(self):
        return {"Content-Type": "application/json", "token": self.token}

    def _post(self, path, data=None):
        return requests.post(self.url + path, json=data, headers=self._build_headers())

    def _get(self, path, data=None):
        return requests.get(self.url + path, params=data, headers=self._build_headers())

    '''
    健康检查,用于检查API服务是否正常运行,文档地址:https://roxybrowser.com/api/v2/#/api_health
    '''

    def health(self):
        return self._get("/health").json()

    '''
    获取工作空间项目列表,用于获取已拥有的空间和项目列表,文档地址:https://roxybrowser.com/api/v2/#/api_workspace
    :param page_index,page_size 分页参数
    '''

    def workspace_project(self):
        return self._get("/browser/workspace").json()

    '''
    获取账号列表,用于获取已配置的平台账号,文档地址:https://roxybrowser.com/api/v2/#/api_account
    :param workspaceId: 工作空间id, 必填，指定要获取哪个空间下的平台账号，通过workspace_project方法获取
    :param accountId: 账号库id, 选填
    :param page_index,page_size 分页参数
    '''

    def account(self, workspaceId: int, accountId: int = 0, page_index: int = 1, page_size: int = 15):
        return self._get("/browser/account",
                         {"workspaceId": workspaceId, "accountId": accountId, "page_index": page_index,
                          "page_size": page_size}).json()

    '''
    获取标签列表,用于获取已配置的标签信息,文档地址:https://roxybrowser.com/api/v2/#/api_label
    :param workspaceId: 工作空间id, 必填，指定要获取哪个空间下的标签，通过workspace_project方法获取
    '''

    def label(self, workspaceId: int):
        return self._get("/browser/label", {"workspaceId": workspaceId}).json()

    '''
    获取窗口列表,文档地址: https://roxybrowser.com/api/v2/#/api_list
    :param workspaceId: 工作空间id, 必填，指定要获取哪个空间下的窗口列表，通过workspace_project方法获取
    :param dirId: 窗口id, 选填；如果填了就只查询这个窗口的信息
    :param page_index,page_size 分页参数
    :res 返回值参考文档
    '''

    def browser_list(self, workspaceId: int, sortNums: str = "", page_index: int = 1, page_size: int = 15):
        return self._get("/browser/list_v2",
                         {"workspaceId": workspaceId, "sortNums": sortNums, "page_index": page_index,
                          "page_size": page_size}).json()

    '''
    创建窗口,文档地址: https://roxybrowser.com/api/v2/#/api_create
    :param data: 创建窗口需要传的参数,参考文档说明，其中workspaceId为必传，通过workspace_project方法获取
    :res 返回值参考文档
    '''

    def browser_create(self, data: dict = None):
        return self._post("/browser/create", data).json()

    '''
    修改窗口，文档地址: https://roxybrowser.com/api/v2/#/api_mdf
    :param data: 修改窗口需要传的参数,参考文档说明，其中workspaceId和dirId为必传，workspaceId通过workspace_project方法获取
    :res 返回值参考文档
    '''

    def browser_mdf(self, data: dict):
        return self._post("/browser/mdf", data).json()

    '''
    删除窗口,文档地址:https://roxybrowser.com/api/v2/#/api_delete
    :param workspaceId: 工作空间id, 必填，指定窗口所在的空间，通过workspace_project方法获取
    :param dirIds: 窗口id列表, 必填，指定要删除的浏览器窗口列表
    :res 返回值参考文档
    '''

    def browser_delete(self, workspaceId: int, dirIds: list):
        return self._post("/browser/delete", {"workspaceId": workspaceId, "dirIds": dirIds}).json()

    '''
    打开窗口,文档地址：https://roxybrowser.com/api/v2/#/api_open
    :param dirId: 需要打开的窗口ID，必填
    :param args: 指定浏览器启动参数，选填
    :res 返回值参考文档
    '''

    def browser_open(self, dirId: str, args=[]):
        return self._post("/browser/open", {"dirId": dirId, "args": args}).json()

    '''
    关闭窗口,文档地址:https://roxybrowser.com/api/v2/#/api_close
    :param dirId: 需要关闭的窗口ID，必填
    :res 返回值参考文档
    '''

    def browser_close(self, dirId: str):
        return self._post("/browser/close", {"dirId": dirId}).json()

    '''
    窗口随机指纹,文档地址：https://roxybrowser.com/api/v2/#/api_random_env
    :param workspaceId: 工作空间id, 必填，指定窗口所在的空间，通过workspace_project方法获取
    :param dirId: 窗口id, 必填，指定需要随机指纹的窗口
    :res 返回值参考文档
    '''

    def browser_random_env(self, workspaceId: int, dirId: str):
        return self._post("/browser/random_env", {"workspaceId": workspaceId, "dirId": dirId}).json()

    '''
    清空窗口本地缓存,文档地址:https://roxybrowser.com/api/v2/#/api_local_cache
    :param dirIds: 窗口id列表, 必填，指定要清空缓存的窗口列表
    :res 返回值参考文档
    '''

    def browser_local_cache(self, dirIds: list):
        return self._post("/browser/clear_local_cache", {"dirIds": dirIds}).json()

    '''
    清空窗口服务器缓存,文档地址:https://roxybrowser.com/api/v2/#/api_server_cache
    :param workspaceId: 工作空间id, 必填，指定窗口所在的空间，通过workspace_project方法获取
    :param dirIds: 窗口id列表, 必填，指定要清空缓存的窗口列表
    :res 返回值参考文档
    '''

    def browser_server_cache(self, workspaceId: int, dirIds: list):
        return self._post("/browser/clear_server_cache", {"workspaceId": workspaceId, "dirIds": dirIds}).json()

    '''
    获取已打开的浏览器信息,文档地址:https://roxybrowser.com/api/v2/#/api_pid
    :param dirIds: 需要查询的窗口ID，选填
    :res 返回值参考文档
    '''

    def browser_connection_info(self, dirIds=[]):
        return self._get("/browser/connection_info", {"dirIds": dirIds}).json()


def get_new_browser(dir_id='1c7fbf6d19db23908ebd41711faef285'):
    # 7C3ACB9F5113
    # 3CDA5E18
    client = RoxyClient(port=50000, token="5586c9a4b2b228ea5f23cec84cbc938d")
    ip = change_ip_v2('3CDA5E18')
    # ip = get_sl_short_ip()

    re = client.browser_mdf({"workspaceId": 3104, "dirId": dir_id,
                        "proxyInfo": {
                            "proxyMethod": "custom",  # 代理方式，枚举值：手动填写：custom，str类型, 非必传，默认为custom
                            "proxyCategory": "HTTP",  # 代理类型，枚举值：noproxy, HTTP, HTTPS, SOCKS5, SSH, str类型，默认为noproxy
                            "ipType": "IPV4",  # 网络协议, 枚举值：IPV4, IPV6，str类型，非必传，默认为IPV4
                            "host": ip['ip'],  # 代理主机，str类型，非必传
                            "port": ip['port'],  # 代理端口，str类型，非必传
                            "proxyUserName": ip['user'],  # 代理账号，str类型，非必传
                            "proxyPassword": ip['password'],  # 代理密码，str类型，非必传
                            "refreshUrl": "http://refresh-hk.roxybrowser.com",  # 刷新URL，str类型，非必传
                            "checkChannel": "IPRust.io"  # IP查询渠道，枚举值：IPRust.io,IP-API,IP123.in，str类型，非必传
                        }})
    print(re)
    browser_info = client.browser_open(dir_id)
    print(browser_info)
    return browser_info


if __name__ == "__main__":

    client = RoxyClient(port=50000, token="5586c9a4b2b228ea5f23cec84cbc938d")
    b = client.workspace_project()
    print(b)
    projectId = b['data']['rows'][0]['id']
    c_list = client.browser_list(projectId, page_size=999)
    print(c_list)
    browser_id = c_list['data']['rows'][0]['dirId']
    a = client.browser_open(browser_id)
    print(a)
    # for i in c_list['data']['rows']:
    #     if i['projectName'] == 'Default':
    #         print(i)
    # # quit()
    # # get_new_browser()
    #
    # a = client.browser_open("1c7fbf6d19db23908ebd41711faef285")
    # print(a['data']['http'])
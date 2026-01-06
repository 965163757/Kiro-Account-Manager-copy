// MCP 服务器预设模板

export const MCP_TEMPLATES = [
  {
    name: 'fetch',
    label: 'Fetch',
    description: '网页内容抓取',
    config: {
      command: 'uvx',
      args: ['mcp-server-fetch'],
      env: {},
      disabled: false,
      autoApprove: []
    }
  },
  {
    name: 'acetool',
    label: 'Acetool',
    description: '代码语义搜索',
    config: {
      command: 'uvx',
      args: ['acetool'],
      env: {},
      disabled: false,
      autoApprove: []
    }
  },
  {
    name: 'aws-docs',
    label: 'AWS Docs',
    description: 'AWS 文档查询',
    config: {
      command: 'uvx',
      args: ['awslabs.aws-documentation-mcp-server@latest'],
      env: { FASTMCP_LOG_LEVEL: 'ERROR' },
      disabled: false,
      autoApprove: []
    }
  },
  {
    name: 'filesystem',
    label: 'Filesystem',
    description: '文件系统操作',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'],
      env: {},
      disabled: false,
      autoApprove: []
    }
  },
  {
    name: 'github',
    label: 'GitHub',
    description: 'GitHub API',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      disabled: false,
      autoApprove: []
    }
  },
  {
    name: 'sqlite',
    label: 'SQLite',
    description: 'SQLite 数据库',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite', '/path/to/database.db'],
      env: {},
      disabled: false,
      autoApprove: []
    }
  }
]

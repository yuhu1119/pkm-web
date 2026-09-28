# 产品知识模型 · 前端

独立 Vite + React 项目，通过平台 SSO 进入，不再提供本地账号密码。

**从建 GitHub 到 SpeedLoop 联调的逐步说明见 [GETTING_STARTED.md](./GETTING_STARTED.md)。**

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE` | 后端前缀。生产填 `/{后端项目code}`，例如 `/pkm-api` |
| `VITE_PROXY_TARGET` | 本地开发时把 `/api`、`/v1` 代理到该网关根地址 |
| `VITE_API_PREFIX` | 与代理配合，把 `/api` 改写成 `{前缀}/api` |
| `VITE_SSO_LOGOUT` | 退出后跳转的平台登出地址 |

复制 `.env.example` 为 `.env`。

## 本地

```bash
npm install
npm run dev
```

生产构建：`npm run build`，把 `dist` 用 `speed deploy frontend` 发到独立前端项目。

`.speedloop.json` 含部署令牌，不要提交。

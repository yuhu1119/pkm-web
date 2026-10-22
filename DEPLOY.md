# 产品知识模型：前后端部署操作说明

两套代码、两种发布方式，不要混。

| | 本机目录 | 怎么上云 |
|---|---|---|
| 后端 | `/Users/tang/AI/pkm-api` | 推 **京东 Coding** → SpeedLoop **Git 同步** |
| 前端 | `/Users/tang/AI/pkm-web` | 本机 `npm run build` → 把 **`dist` 整包上传** |

原来的 `Product Knowledge Model`（FastAPI）**不要**再部署到 SpeedLoop。

---

## 0. 当前已上线环境（改代码前先对照）

把这些值当成默认预设。换项目 / 换路径时，只改这一表，再改前端 `.env` 后重新 build。

| 项 | 当前值 | 以后若变了要改什么 |
|---|---|---|
| 前端访问地址 | `http://speed-p.5.jd.com/design` | `pkm-web/.env` 里 `VITE_BASE_PATH` |
| 前端实际页面（Hash） | `http://speed-p.5.jd.com/design/#/` | 不要改回 Browser 路由去请求 `/design/login` |
| 后端项目 code | `ProductKnowledgeModel` | `pkm-web/.env` 里 `VITE_API_BASE` |
| 接口根路径 | `http://speed-p.5.jd.com/api/ProductKnowledgeModel` | 网关是 **`/api/{code}`**，不是 `/{code}` |
| 健康检查 | `http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/health` | 应返回 JSON `ok: true` |
| 登录态接口示例 | `http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/auth/me` | 浏览器已 SSO 登录时才通 |
| 访问记录 | `POST .../api/ProductKnowledgeModel/api/audit/visit` | 必须有 POST Worker，否则 405 |
| 后端 Git | `git@coding.jd.com:tangyuhu3/pkm-api.git` | 本机 `pkm-api` 的 `origin` |
| Coding 提交作者 | 姓名 `tangyuhu3`，邮箱 `tangyuhu3@jd.com` | 用本机 `Tang / qq.com` 会被拒 |

前端 `.env` 当前必须是：

```bash
VITE_API_BASE=/api/ProductKnowledgeModel
VITE_BASE_PATH=/design
```

拼出来的请求是：

`{VITE_API_BASE}` + `{axios 的 /api/...}`  
→ `/api/ProductKnowledgeModel/api/auth/me`

---

## 1. 第一次部署后端（只做一次）

若 SpeedLoop 上已经能新建产品、库里有数据，这一节跳过，从第 2 节开始。

### 1.1 平台上建后端项目

1. 打开 SpeedLoop 控制台，**新建后端项目**。
2. 记下 **项目 code**（现在是 `ProductKnowledgeModel`）。
3. Git 源填 Coding 仓库 `tangyuhu3/pkm-api`，分支 `main`。
4. Workers 目录填 `workers`，Modules 目录填 `modules`。
5. 平台若要拉代码的 SSH 公钥：到 Coding 仓库部署密钥里添加。**不要**用本机 `id_ed25519` 去填「平台拉代码」；平台要的是它自己那把公钥对应的私钥（PEM）。本机推代码用你自己的 SSH 即可。

### 1.2 配 SQLite

1. Databases 里新建连接，类型选 **SQLite**。
2. 记下配置 ID，填到项目环境变量 `DB_CONFIG_ID`。
3. 可选：`ADMIN_USERNAMES` 填你的 SSO 用户名（逗号分隔）。不填则第一个进来的人是管理员。
4. 在 SQL 控制台执行 `pkm-api/sql/schema.sql`。一次只能跑一条的话，按分号拆开执行。

### 1.3 确认 Worker 已注册

同步 Git 后，至少要有这些脚本（头部 `@route` 会自动注册）：

- `workers/health.lua`：`GET /api/health`（可不登录）
- `workers/api.lua`：`ALL /api`
- `workers/api_post.lua` / `api_put.lua` / `api_patch.lua` / `api_delete.lua` / `api_options.lua`（网关不会把 ALL 当成 POST，缺了会 405）
- `workers/v1.lua`：开放 API

浏览器打开：

`http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/health`

有 JSON 即后端项目通了。

---

## 2. 以后每次改后端（日常）

在 Cursor 里打开文件夹 `/Users/tang/AI/pkm-api`，终端执行。

### 2.1 看改动

```bash
cd /Users/tang/AI/pkm-api
git status
```

### 2.2 提交（作者必须是京东账号）

不要 `git add` `.env`、密钥、令牌。

```bash
cd /Users/tang/AI/pkm-api

git add modules workers sql

GIT_AUTHOR_NAME='tangyuhu3' GIT_AUTHOR_EMAIL='tangyuhu3@jd.com' GIT_COMMITTER_NAME='tangyuhu3' GIT_COMMITTER_EMAIL='tangyuhu3@jd.com' git commit -m "说明这次改了什么"
```

若漏了作者环境变量，Coding 会拒：`作者是 Tang / qq.com，正确作者是 tangyuhu3@jd.com`。未推上去时，在同一目录执行：

```bash
GIT_AUTHOR_NAME='tangyuhu3' GIT_AUTHOR_EMAIL='tangyuhu3@jd.com' GIT_COMMITTER_NAME='tangyuhu3' GIT_COMMITTER_EMAIL='tangyuhu3@jd.com' git commit --amend --reset-author --no-edit
```

### 2.3 推到 Coding

```bash
git push origin main
```

成功应类似：`xxxx..yyyy  main -> main`。

若显示 `Everything up-to-date`：还没 `git add` / `git commit`，先做 2.2。

### 2.4 SpeedLoop 拉代码

打开后端项目 → Git → **同步**（或「从 Git 拉取」）。

只 push 到 Coding，云上 Worker **不会**自动变。

---

## 3. 第一次 / 以后部署前端（每次改页面都要）

前端 **不靠** Git 同步运行。平台上的是静态文件：`index.html` + `dist/assets/`。

### 3.1 改预设（换路径、换后端 code 时必做）

用文本编辑打开 `/Users/tang/AI/pkm-web/.env`（构建只读 `.env`，**不读** `.env.example`）：

```bash
# 网关 + 后端 code。请求变成 /api/{code}/api/...
VITE_API_BASE=/api/ProductKnowledgeModel

# 前端挂在哪个子路径。地址是 http://host/design 就填 /design
VITE_BASE_PATH=/design
```

规则：

- 后端 code 变了：只改 `VITE_API_BASE=/api/新code`，不要写成 `/新code`。
- 前端子路径变了：改 `VITE_BASE_PATH`，例如挂在 `/pkm` 就填 `/pkm`。
- 本地 `npm run dev` 仍走根路径（`.env.development` 里 `VITE_BASE_PATH=/`），不影响生产包。

改完 `.env` **必须重新 build**，旧 `dist` 里仍是旧前缀。

### 3.2 构建

```bash
cd /Users/tang/AI/pkm-web
npm install
npm run build
```

检查 `pkm-web/dist/index.html` 里资源应是：

`/design/assets/index-xxxxx.js`

（`VITE_BASE_PATH=/design` 时。）

### 3.3 上传

把 **`/Users/tang/AI/pkm-web/dist` 整个目录** 上传到 SpeedLoop 前端项目（zip 也行，解压后应能直接看到 `index.html` 和 `assets/`）。

不要只传 `index.html`。不要把 `src` 源码当站点上传。

### 3.4 打开页面

正确地址：

- 入口：`http://speed-p.5.jd.com/design`
- 进去后会变成：`http://speed-p.5.jd.com/design/#/`
- 登录等待：`http://speed-p.5.jd.com/design/#/login`

用已登录公司 SSO 的浏览器。Network 里接口应是：

`http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/auth/me`

---

## 4. 以后开发必须提前定好的约定

改功能前按这张表写，避免再出现空白页、405、路径 404。

### 4.1 前端路径

| 约定 | 说明 |
|---|---|
| 生产用 Hash 路由 | 地址带 `#/`。静态托管没有 `/design/login` 这个文件，禁止再 `window.location.href = '/design/login'` |
| `VITE_BASE_PATH` | 等于浏览器里前端目录，现为 `/design`。资源绝对路径 `/design/assets/...` |
| axios 请求写 `/api/...` | 例如 `api.get("/api/products")`，前缀由 `VITE_API_BASE` 拼接 |
| `VITE_API_BASE` | 必须是 `/api/{后端code}`，现为 `/api/ProductKnowledgeModel` |

### 4.2 后端路径

| 约定 | 说明 |
|---|---|
| Worker 逻辑路径 | Lua 里是 `/api/xxx`，网关对外是 `/api/{code}/api/xxx` |
| 新增写接口 | 除 `api.lua` 的 ALL 外，确认已有 `api_post.lua` 等；否则浏览器 POST 直接 405 |
| 列表接口 | 必须返回 **JSON 数组** `[]`。空表不要变成 `{}`，否则前端 `.find` 会崩 |
| 知识全景 | `GET /api/landscape` 必须带 `summary.product_total`、`products[].features`、`product_edges`、`feature_edges` |
| 产品关系入参 | 前端传 `from_id` / `to_id`，不要只认 `from_product_id` |

### 4.3 Git

| 约定 | 说明 |
|---|---|
| 后端只推 `pkm-api` | 不要把 FastAPI 仓推到这个 Coding 仓库 |
| 提交作者 | 每次 commit 用第 2.2 节的环境变量 |
| 前端仓 | 源码可以另存 Git；**运行中的站点只认 dist** |

### 4.4 认证与数据

| 约定 | 说明 |
|---|---|
| 无本地密码 | 只走 SpeedLoop SSO，`/api/auth/me` |
| 库 | 平台 SQLite，`DB_CONFIG_ID` 配在 SpeedLoop 环境变量，不进 Git |
| 上传文档 | 本期只支持 txt / md / html / json 正文，不解析 Word/PDF/Excel |

---

## 5. 改完怎么验收（3 分钟）

1. `http://speed-p.5.jd.com/api/ProductKnowledgeModel/api/health` 有 JSON。
2. 打开 `http://speed-p.5.jd.com/design`，地址变成带 `#/`，能看到首页而不是「页面无法显示」。
3. Network：`/api/ProductKnowledgeModel/api/auth/me` 为 200。
4. 能进产品管理；知识全景不再报 `product_total`。
5. 若改过 Lua：SpeedLoop 已点过同步，且 POST `audit/visit` 不是 405。

---

## 6. 出问题对照

| 现象 | 原因 | 做什么 |
|---|---|---|
| push 显示 Everything up-to-date | 没 commit | 先 add + commit 再 push |
| Coding 拒 commit 作者 | 邮箱不是 `tangyuhu3@jd.com` | 第 2.2 节 amend 后再 push |
| 改了 Lua 页面没变 | 只推了 Git，没同步平台 | SpeedLoop 点同步 |
| 改了前端 `.env` 接口还是旧路径 | 没重新 build / 传了旧 dist | 再 `npm run build` 后上传 |
| 一闪只剩背景色 | 曾经跳到 `/design/login` 静态 404 | 用现在的 Hash 包，打开 `/design/#/` |
| `t.find is not a function` | 列表接口不是数组 | 看该接口响应是不是 `[]` |
| `product_total` 异常 | landscape 缺 `summary` | 确认已同步含全景接口的后端 |
| POST 405 Not Allowed | 网关没注册 POST | 确认 `workers/api_post.lua` 已同步 |
| 接口少一段 `/api` | `VITE_API_BASE` 写成了 `/ProductKnowledgeModel` | 改成 `/api/ProductKnowledgeModel` 再 build |
| 资源 404 `/assets/...` | `VITE_BASE_PATH` 不是 `/design` | `.env` 改完重新 build |

---

## 7. 两套命令备忘（复制即用）

**后端发布：**

```bash
cd /Users/tang/AI/pkm-api
git add modules workers sql
GIT_AUTHOR_NAME='tangyuhu3' GIT_AUTHOR_EMAIL='tangyuhu3@jd.com' GIT_COMMITTER_NAME='tangyuhu3' GIT_COMMITTER_EMAIL='tangyuhu3@jd.com' git commit -m "说明"
git push origin main
```

然后 SpeedLoop 后端项目 → Git 同步。

**前端发布：**

```bash
cd /Users/tang/AI/pkm-web
# 确认 .env 里 VITE_API_BASE 与 VITE_BASE_PATH
npm run build
```

上传 `/Users/tang/AI/pkm-web/dist`。

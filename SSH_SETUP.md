# SpeedLoop Git 拉取：没有「生成项目 SSH」时怎么配

开发手册**没有**「在 Git 设置里点一下生成项目钥」这种功能。  
界面上没有该按钮是正常的，**不要卡在找这个按钮**。

报错 `SSH repository requires project-specific SSH key. Do NOT use system default keys` 的含义是：

- 仓库地址填了 `git@...`（SSH）
- Git 设置里**没有填本项目的私钥**
- 平台禁止用机器上的系统默认钥

只有两条路：

1. **推荐：改成 HTTPS + 私人令牌**（不需要任何 SSH 生成功能）
2. 坚持 SSH：本机生成一把**专用**钥匙，把**私钥粘进 Git 设置的文本框**（没有文本框就无法用 SSH）

本机 `id_ed25519` 只给 **你电脑 `git push`** 用，解决不了平台拉取。

---

## 路线 1（推荐）：HTTPS，不配 SSH

### 1. 在 Coding 创建私人令牌

1. 打开 Coding，头像 → **个人设置** → **私人令牌** / Access Token。
2. **新建令牌**，名称如 `speedloop-pkm-api`。
3. 权限勾选能 **读仓库** 即可。
4. 生成后 **立刻复制**，只显示一次。不要提交 Git。

### 2. 在 SpeedLoop Git 设置里改地址和认证

打开 **后端项目 → Git 设置 / Git 同步**：

| 项 | 填什么 |
|----|--------|
| 仓库地址 | `https://coding.jd.com/tangyuhu3/pkm-api.git`（必须是 https，不要 `git@`） |
| 分支 | `main` |
| 用户名 | Coding 账号，一般是 `tangyuhu3` |
| 密码 / Token | 上一步的令牌（**不要**填邮箱登录密码） |
| Workers 路径 | `workers` |
| Modules 路径 | `modules` |

若有「认证方式」，选 **HTTPS** / **Token**，不要选 SSH。

保存后再点 **拉取 / 同步**。

---

## 路线 2：没有生成按钮，但仍要用 SSH

在 Git 页找这些**输入框**（可能在高级 / 认证里）：

- SSH 私钥 / Private Key / Deploy Key / Git SSH Key

没有私钥文本框、只有仓库 URL 时，**这个版本只能走路线 1**。

本机生成专用钥（不要覆盖已有的 `id_ed25519`）：

```bash
ssh-keygen -t ed25519 -C "speedloop-pkm-api" -f ~/.ssh/speedloop_pkm_api -N ""
cat ~/.ssh/speedloop_pkm_api.pub
cat ~/.ssh/speedloop_pkm_api
```

- `.pub` 一行 → Coding 仓库 **设置 → 部署公钥**（只读）
- 私钥全文（`BEGIN` 到 `END`）→ 粘进 SpeedLoop Git 设置的私钥框

不要把 `~/.ssh/id_ed25519` 贴给平台（那就是报错里禁止的默认钥）。

仓库地址：`git@coding.jd.com:tangyuhu3/pkm-api.git`  
Workers = `workers`，Modules = `modules`。

---

## 本机 push（和平台拉取无关）

`ssh -T git@coding.jd.com` 已成功即可。远程用：

`git@coding.jd.com:tangyuhu3/pkm-api.git`

个人公钥在 Coding **个人设置 → SSH 公钥**。

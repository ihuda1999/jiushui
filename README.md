# 酒水核验表单

胡大三店酒水核验信息录入系统，上酒前留存凭证。

提交的核验信息自动同步到飞书多维表格，包括桌台号、酒水名称、条形码照片和生产日期照片。

## 技术栈

- **前端**: React + Vite + TailwindCSS + Lucide Icons
- **后端**: Express + TypeScript
- **AI**: Google Gemini API
- **存储**: 飞书多维表格（通过开放 API）

## 本地运行

**前置条件:** Node.js

1. 安装依赖：
   ```bash
   npm install
   ```

2. 复制环境变量文件并填写配置：
   ```bash
   cp .env.example .env
   ```
   必填项：
   - `GEMINI_API_KEY` — Gemini API Key
   - `FEISHU_APP_ID` — 飞书自建应用 App ID
   - `FEISHU_APP_SECRET` — 飞书自建应用 App Secret
   - `FEISHU_APP_TOKEN` — 飞书多维表格 App Token
   - `FEISHU_TABLE_ID` — 飞书多维表格 Table ID

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 打开 http://localhost:3000

## 生产构建

```bash
npm run build
npm start
```

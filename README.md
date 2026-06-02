# CitationChat（企业知识库 RAG 助手）
一个面向企业内部资料的“可追溯引用”知识库问答系统：文档导入与索引、RAG 问答、引用证据展示、反馈闭环与评测。

## 技术栈
- 前端：React + TypeScript + Vite + TailwindCSS
- 后端：FastAPI（Conda 环境）
- 数据库：PostgreSQL + pgvector
- 模型：OpenAI 兼容 API（后续接入）

## 本地启动（开发）

### 1) 前端
```bash
npm install
npm run dev
```

### 2) 后端（Conda）
```bash
conda env create -f environment.yml
conda activate citationchat
uvicorn app.main:app --reload --app-dir api --host 0.0.0.0 --port 8000
```

### 3) 数据库（Docker Compose）
```bash
docker compose up -d db
```

初始化表结构（会在数据库容器内执行 migrations SQL）：
```bash
docker compose exec -T db psql -U citationchat -d citationchat -f /migrations/20260602_0001_init.sql
```

健康检查：
```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/db
```

前端在开发模式下会将 `/api` 代理到 `http://localhost:8000`（见 [vite.config.ts](file:///E:/%E6%A1%8C%E9%9D%A2/Test_Pro/vite.config.ts)）。

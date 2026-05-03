# 交易系统

基于 React + Go 的实时K线交易终端。

## 技术栈

- **后端**: Go + Gin + Gorilla WebSocket + MySQL
- **前端**: React + Vite + Lightweight Charts

## 启动方式

### 后端（热部署）

```bash
cd back
air
```

### 前端

```bash
cd front
npm run dev
```

## 访问地址

- 前端: http://localhost:4000
- 后端API: http://localhost:8080
- WebSocket: ws://localhost:8080/ws

## 配置

后端配置文件 `back/.env`：

```
MYSQL_HOST=8.145.45.155
MYSQL_PORT=3306
MYSQL_USER=appuser
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=trade
SERVER_PORT=8080
```
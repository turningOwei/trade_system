package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

// Config 应用配置
type Config struct {
	MySQLHost     string
	MySQLPort     string
	MySQLUser     string
	MySQLPassword string
	MySQLDatabase string
	ServerPort    string
}

var config *Config
var db *sql.DB

// 加载配置
func loadConfig() *Config {
	err := godotenv.Load()
	if err != nil {
		log.Println("未找到.env文件，使用环境变量")
	}

	return &Config{
		MySQLHost:     getEnv("MYSQL_HOST", "localhost"),
		MySQLPort:     getEnv("MYSQL_PORT", "3306"),
		MySQLUser:     getEnv("MYSQL_USER", "root"),
		MySQLPassword: getEnv("MYSQL_PASSWORD", ""),
		MySQLDatabase: getEnv("MYSQL_DATABASE", "trade_system"),
		ServerPort:    getEnv("SERVER_PORT", "8080"),
	}
}

// 获取环境变量
func getEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if value == "" {
		return defaultValue
	}
	return value
}

// 初始化数据库连接
func initDB() {
	cfg := mysql.Config{
		User:                 config.MySQLUser,
		Passwd:               config.MySQLPassword,
		Net:                  "tcp",
		Addr:                 config.MySQLHost + ":" + config.MySQLPort,
		DBName:               config.MySQLDatabase,
		AllowNativePasswords: true,
	}

	var err error
	db, err = sql.Open("mysql", cfg.FormatDSN())
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	log.Println("数据库连接成功")
}

// Tick K线数据结构
type Tick struct {
	Time   int64   `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
}

// Market 市场数据
type Market struct {
	mu        sync.RWMutex
	ticks     []Tick
	clients   map[*websocket.Conn]bool
	clientsMu sync.RWMutex
}

var market *Market

// 从数据库加载历史数据（最新的500条）
func loadHistoryFromDB() []Tick {
	rows, err := db.Query(`
		SELECT UNIX_TIMESTAMP(datetime) as time, open, high, low, close, volume
		FROM trade_1min
		WHERE DATE(datetime) >= DATE_SUB(CURDATE(), INTERVAL 5 DAY)
		ORDER BY datetime ASC
	`)
	if err != nil {
		log.Println("查询数据库失败:", err)
		return nil
	}
	defer rows.Close()

	var ticks []Tick
	for rows.Next() {
		var t Tick
		err := rows.Scan(&t.Time, &t.Open, &t.High, &t.Low, &t.Close, &t.Volume)
		if err != nil {
			log.Println("扫描数据失败:", err)
			continue
		}
		ticks = append(ticks, t)
	}

	log.Println("从数据库加载了", len(ticks), "条K线数据")
	return ticks
}

// 初始化市场数据
func initMarket() {
	market = &Market{
		ticks:   loadHistoryFromDB(),
		clients: make(map[*websocket.Conn]bool),
	}
}

// WebSocket升级器
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// 处理WebSocket连接
func handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket升级失败:", err)
		return
	}
	defer conn.Close()

	market.clientsMu.Lock()
	market.clients[conn] = true
	market.clientsMu.Unlock()

	log.Println("新的WebSocket连接")

	// 发送历史数据
	market.mu.RLock()
	history := make([]Tick, len(market.ticks))
	copy(history, market.ticks)
	market.mu.RUnlock()

	err = conn.WriteJSON(map[string]interface{}{
		"type":    "history",
		"history": history,
	})
	if err != nil {
		log.Println("发送历史数据失败:", err)
		return
	}

	// 保持连接
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			market.clientsMu.Lock()
			delete(market.clients, conn)
			market.clientsMu.Unlock()
			log.Println("WebSocket断开:", err)
			break
		}
	}
}

// 获取历史数据
func getHistory(c *gin.Context) {
	market.mu.RLock()
	defer market.mu.RUnlock()

	history := make([]Tick, len(market.ticks))
	copy(history, market.ticks)

	c.JSON(http.StatusOK, history)
}

func main() {
	// 加载配置
	config = loadConfig()

	// 初始化数据库
	initDB()

	// 初始化市场数据
	initMarket()

	// 设置Gin路由
	r := gin.Default()

	// CORS中间件
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// API路由
	r.GET("/history", getHistory)
	r.GET("/ws", handleWebSocket)

	log.Println("服务器启动在 :" + config.ServerPort)
	r.Run(":" + config.ServerPort)
}

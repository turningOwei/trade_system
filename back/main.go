package main

import (
	"database/sql"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"

	"trade-system/util"
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

// GridSearchResult 网格搜索结果
type GridSearchResult struct {
	Fast         int     `json:"fast"`         // KAMA 快线 ER 周期
	Slow         int     `json:"slow"`         // KAMA 慢线 ER 周期
	SlowSmooth   int     `json:"slowSmooth"`   // KAMA 慢速平滑常数周期
	TotalReturn  float64 `json:"totalReturn"`
	NumTrades    int     `json:"numTrades"`
	WinRate      float64 `json:"winRate"`
	Expectancy   float64 `json:"expectancy"` // 期望值 = 胜率 × 平均盈利 - 败率 × 平均亏损
}

// TradeRecord 单笔交易记录
type TradeRecord struct {
	BuyTime   int64   `json:"buyTime"`
	BuyPrice  float64 `json:"buyPrice"`
	SellTime  int64   `json:"sellTime"`
	SellPrice float64 `json:"sellPrice"`
	Return    float64 `json:"return"`
	Direction string  `json:"direction"` // "long" 做多, "short" 做空
}

// GridSearchResponse 网格搜索响应
type GridSearchResponse struct {
	Results []GridSearchResult `json:"results"`
	Best    GridSearchResult   `json:"best"`
	Trades  []TradeRecord      `json:"trades"`
}

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

// 刷新市场数据（从数据库重新加载）
func refreshData(c *gin.Context) {
	market.mu.Lock()
	market.ticks = loadHistoryFromDB()
	count := len(market.ticks)
	market.mu.Unlock()

	// 通知所有已连接的客户端
	market.clientsMu.RLock()
	for client := range market.clients {
		history := make([]Tick, count)
		copy(history, market.ticks)
		client.WriteJSON(map[string]interface{}{
			"type":    "history",
			"history": history,
		})
	}
	market.clientsMu.RUnlock()

	c.JSON(http.StatusOK, gin.H{"count": count})
}

// backtest 回测单个KAMA交叉策略组合（多空双向）
func backtest(ticks []Tick, fastPeriod, slowPeriod, slowSmooth int) (float64, int, float64, float64, []TradeRecord) {
	n := len(ticks)
	if n < slowPeriod {
		return 0, 0, 0, 0, nil
	}

	closes := make([]float64, n)
	for i := 0; i < n; i++ {
		closes[i] = ticks[i].Close
	}

	signals := util.DetectKAMACross(closes, fastPeriod, slowPeriod, 2, slowSmooth)

	// 0=空仓, 1=持多仓, -1=持空仓
	position := 0
	cash := 1.0
	entryPrice := 0.0
	entryTime := int64(0)
	var trades []TradeRecord
	wins := 0

	for _, sig := range signals {
		if position == 0 {
			// 空仓状态
			if sig.IsLong {
				// 金叉开多
				position = 1
				entryPrice = ticks[sig.Index].Close
				entryTime = ticks[sig.Index].Time
			} else {
				// 死叉开空
				position = -1
				entryPrice = ticks[sig.Index].Close
				entryTime = ticks[sig.Index].Time
			}
		} else if position == 1 && !sig.IsLong {
			// 持多仓状态，死叉平多并反手开空
			sellPrice := ticks[sig.Index].Close
			cash = cash * (1 + (sellPrice-entryPrice)/entryPrice)
			tradeReturn := (sellPrice - entryPrice) / entryPrice
			if tradeReturn > 0 {
				wins++
			}
			trades = append(trades, TradeRecord{
				BuyTime:   entryTime,
				BuyPrice:  entryPrice,
				SellTime:  ticks[sig.Index].Time,
				SellPrice: sellPrice,
				Return:    tradeReturn,
				Direction: "long",
			})
			// 反手开空
			position = -1
			entryPrice = ticks[sig.Index].Close
			entryTime = ticks[sig.Index].Time
		} else if position == -1 && sig.IsLong {
			// 持空仓状态，金叉平空并反手开多
			sellPrice := ticks[sig.Index].Close
			tradeReturn := (entryPrice - sellPrice) / entryPrice
			if tradeReturn > 0 {
				wins++
			}
			cash = cash * (1 + tradeReturn)
			trades = append(trades, TradeRecord{
				BuyTime:   entryTime,
				BuyPrice:  entryPrice,
				SellTime:  ticks[sig.Index].Time,
				SellPrice: sellPrice,
				Return:    tradeReturn,
				Direction: "short",
			})
			// 反手开多
			position = 1
			entryPrice = ticks[sig.Index].Close
			entryTime = ticks[sig.Index].Time
		}
	}

	// 强制平仓（只计算收益，不生成交易记录）
	if position != 0 {
		lastClose := ticks[n-1].Close
		var tradeReturn float64
		if position == 1 {
			tradeReturn = (lastClose - entryPrice) / entryPrice
		} else {
			tradeReturn = (entryPrice - lastClose) / entryPrice
		}
		if tradeReturn > 0 {
			wins++
		}
		cash = cash * (1 + tradeReturn)
	}

	totalReturn := (cash - 1.0) / 1.0
	numTrades := len(trades)
	winRate := 0.0
	expectancy := 0.0
	if numTrades > 0 {
		winRate = float64(wins) / float64(numTrades)
		// 计算期望值 = 胜率 × 平均盈利 - 败率 × 平均亏损
		var avgWin, avgLoss float64
		var winCount, lossCount int
		for _, t := range trades {
			if t.Return > 0 {
				avgWin += t.Return
				winCount++
			} else {
				avgLoss += math.Abs(t.Return)
				lossCount++
			}
		}
		if winCount > 0 {
			avgWin /= float64(winCount)
		}
		if lossCount > 0 {
			avgLoss /= float64(lossCount)
		}
		expectancy = winRate*avgWin - (1-winRate)*avgLoss
	}
	return totalReturn, numTrades, winRate, expectancy, trades
}

// handleGridSearch 处理网格搜索请求
func handleGridSearch(c *gin.Context) {
	market.mu.RLock()
	ticks := market.ticks
	market.mu.RUnlock()

	if len(ticks) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无可用数据"})
		return
	}

	var allResults []GridSearchResult
	var bestResult GridSearchResult
	var bestTrades []TradeRecord
	bestExpectancy := -math.MaxFloat64

	for fast := 3; fast <= 30; fast++ {
		for slow := 10; slow <= 60; slow++ {
			if fast >= slow {
				continue
			}
			for _, slowSmooth := range []int{10, 20, 30, 40} {
				totalReturn, numTrades, winRate, expectancy, trades := backtest(ticks, fast, slow, slowSmooth)

				result := GridSearchResult{
					Fast:        fast,
					Slow:        slow,
					SlowSmooth:  slowSmooth,
					TotalReturn: totalReturn,
					NumTrades:   numTrades,
					WinRate:     winRate,
					Expectancy:  expectancy,
				}
				allResults = append(allResults, result)

				if expectancy > bestExpectancy {
					bestExpectancy = expectancy
					bestResult = result
					bestTrades = trades
				}
			}
		}
	}

	// 按期望值降序排序
	sort.Slice(allResults, func(i, j int) bool {
		return allResults[i].Expectancy > allResults[j].Expectancy
	})

	// 取前20
	topN := 20
	if len(allResults) < topN {
		topN = len(allResults)
	}

	c.JSON(http.StatusOK, GridSearchResponse{
		Results: allResults[:topN],
		Best:    bestResult,
		Trades:  bestTrades,
	})
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
	r.GET("/grid-search", handleGridSearch)
	r.GET("/refresh", refreshData)

	log.Println("服务器启动在 :" + config.ServerPort)
	r.Run(":" + config.ServerPort)
}

// HyperA v0.1 — WebSocket Hub + HTTP Server for standalone desktop mode
// Serves embedded frontend and streams trading state via WebSocket.
// Replaces server.ts (Node.js + Socket.IO bridge) entirely.

package main

import (
        "embed"
        "encoding/json"
        "fmt"
        "io/fs"
        "log"
        "net"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        "runtime"
        "strings"
        "sync"
        "time"

        "github.com/gorilla/websocket"
)

//go:embed all:frontend
var frontendFS embed.FS

var upgrader = websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool { return true },
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBSOCKET HUB
// ═══════════════════════════════════════════════════════════════════════════════

type WSClient struct {
        hub  *WSHub
        conn *websocket.Conn
        send chan []byte
}

type WSHub struct {
        clients    map[*WSClient]bool
        broadcast  chan []byte
        register   chan *WSClient
        unregister chan *WSClient
        mu         sync.RWMutex
        agent      *Agent
}

func NewWSHub(agent *Agent) *WSHub {
        return &WSHub{
                clients:    make(map[*WSClient]bool),
                broadcast:  make(chan []byte, 256),
                register:   make(chan *WSClient),
                unregister: make(chan *WSClient),
                agent:      agent,
        }
}

func (h *WSHub) Run() {
        for {
                select {
                case client := <-h.register:
                        h.mu.Lock()
                        h.clients[client] = true
                        h.mu.Unlock()
                        logMsg("INFO", "WS client connected (total: %d)", h.ClientCount())
                case client := <-h.unregister:
                        h.mu.Lock()
                        if _, ok := h.clients[client]; ok {
                                delete(h.clients, client)
                                close(client.send)
                        }
                        h.mu.Unlock()
                        logMsg("INFO", "WS client disconnected (total: %d)", h.ClientCount())
                case msg := <-h.broadcast:
                        h.mu.RLock()
                        for client := range h.clients {
                                select {
                                case client.send <- msg:
                                default:
                                        close(client.send)
                                        delete(h.clients, client)
                                }
                        }
                        h.mu.RUnlock()
                }
        }
}

func (h *WSHub) Broadcast(msg []byte) {
        select {
        case h.broadcast <- msg:
        default:
                // channel full, drop
        }
}

func (h *WSHub) ClientCount() int {
        h.mu.RLock()
        defer h.mu.RUnlock()
        return len(h.clients)
}

func (c *WSClient) readPump() {
        defer func() {
                c.hub.unregister <- c
                c.conn.Close()
        }()
        for {
                _, message, err := c.conn.ReadMessage()
                if err != nil {
                        break
                }
                // Parse incoming message from dashboard
                var msg map[string]interface{}
                if err := json.Unmarshal(message, &msg); err != nil {
                        continue
                }
                msgType, _ := msg["type"].(string)
                switch msgType {
                case "config_update":
                        // Forward to agent's stdin handler
                        if c.hub.agent != nil {
                                configBytes, _ := json.Marshal(msg)
                                c.hub.agent.HandleStdinLine(configBytes)
                        }
                case "run_backtest":
                        if c.hub.agent != nil {
                                btBytes, _ := json.Marshal(msg)
                                c.hub.agent.HandleStdinLine(btBytes)
                        }
                case "reset_circuit_breaker":
                        if c.hub.agent != nil {
                                c.hub.agent.HandleStdinLine([]byte(`{"type":"RESET_CB"}`))
                        }
                case "trigger_update":
                        if c.hub.agent != nil {
                                tbBytes, _ := json.Marshal(msg)
                                c.hub.agent.HandleStdinLine(tbBytes)
                        }
                // HYP-004: START/STOP messages — previously these were emitted by the
                // dashboard but silently dropped because no case handled them.
                // Now they toggle the agent's paused flag, which Run() respects.
                case "start":
                        if c.hub.agent != nil {
                                c.hub.agent.SetPaused(false)
                        } else {
                                logMsg("WARN", "START received but agent not initialized")
                        }
                case "stop":
                        if c.hub.agent != nil {
                                c.hub.agent.SetPaused(true)
                        } else {
                                logMsg("WARN", "STOP received but agent not initialized")
                        }
                }
        }
}

func (c *WSClient) writePump() {
        ticker := time.NewTicker(30 * time.Second)
        defer func() {
                ticker.Stop()
                c.conn.Close()
        }()
        for {
                select {
                case msg, ok := <-c.send:
                        if !ok {
                                c.conn.WriteMessage(websocket.CloseMessage, []byte{})
                                return
                        }
                        if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
                                return
                        }
                case <-ticker.C:
                        if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                                return
                        }
                }
        }
}

func serveWS(hub *WSHub, w http.ResponseWriter, r *http.Request) {
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
                log.Printf("WS upgrade error: %v", err)
                return
        }
        client := &WSClient{hub: hub, conn: conn, send: make(chan []byte, 256)}
        hub.register <- client

        go client.writePump()
        client.readPump()
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP SERVER — serves embedded frontend + WS endpoint
// ═══════════════════════════════════════════════════════════════════════════════

func startHTTPServer(hub *WSHub, port int) error {
        // Serve embedded frontend
        _, err := fs.Sub(frontendFS, "frontend")
        if err != nil {
                return fmt.Errorf("frontend embed error: %w", err)
        }

        mux := http.NewServeMux()

        // WebSocket endpoint
        mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
                serveWS(hub, w, r)
        })

        // Config endpoints
        mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
                w.Header().Set("Content-Type", "application/json")
                if r.Method == "GET" {
                        configPath := getConfigPath()
                        data, err := os.ReadFile(configPath)
                        if err != nil {
                                // Return default config
                                defaultCfg := DefaultConfig()
                                json.NewEncoder(w).Encode(defaultCfg)
                                return
                        }
                        // HYP-005: decrypt secret fields before sending to the dashboard.
                        // The dashboard needs plaintext to display current values in the
                        // config form. The HTTP server is bound to localhost only, so
                        // plaintext over the wire is acceptable.
                        decrypted, err := UnmarshalEncryptedConfig(data)
                        if err != nil {
                                logMsg("ERROR", "Failed to decrypt config: %v — returning defaults", err)
                                defaultCfg := DefaultConfig()
                                json.NewEncoder(w).Encode(defaultCfg)
                                return
                        }
                        out, _ := json.Marshal(decrypted)
                        w.Write(out)
                        return
                }
                if r.Method == "POST" {
                        var newCfg map[string]interface{}
                        if err := json.NewDecoder(r.Body).Decode(&newCfg); err != nil {
                                http.Error(w, "invalid JSON", 400)
                                return
                        }
                        configPath := getConfigPath()
                        os.MkdirAll(filepath.Dir(configPath), 0755)
                        // HYP-005: encrypt secret fields before writing to disk.
                        // Plaintext in memory → encrypted envelope on disk.
                        data, err := MarshalEncryptedConfig(newCfg)
                        if err != nil {
                                logMsg("ERROR", "Failed to encrypt config: %v", err)
                                http.Error(w, "encryption error", 500)
                                return
                        }
                        if err := os.WriteFile(configPath, data, 0600); err != nil {
                                http.Error(w, "save error", 500)
                                return
                        }
                        // Forward decrypted config to agent (agent uses plaintext internally)
                        if hub.agent != nil {
                                // Strip any envelope-shaped fields back to plaintext for the agent
                                // (newCfg should already be plaintext since it came from the dashboard)
                                cfgBytes, _ := json.Marshal(newCfg)
                                hub.agent.HandleStdinLine(cfgBytes)
                        }
                        w.Write([]byte(`{"status":"ok"}`))
                        return
                }
                http.Error(w, "method not allowed", 405)
        })

        // Quit endpoint — cleanly shuts down the app (called from UI Quit button)
        mux.HandleFunc("/api/quit", func(w http.ResponseWriter, r *http.Request) {
                w.Header().Set("Content-Type", "application/json")
                w.Write([]byte(`{"status":"ok"}`))
                go func() {
                        time.Sleep(200 * time.Millisecond)
                        logMsg("INFO", "🛑 HyperA shutdown requested via UI")
                        os.Exit(0)
                }()
        })

        // Static file server — custom handler to serve embedded Next.js export
        // Handles Next.js trailingSlash:true convention: /page → /page/index.html
        mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
                w.Header().Set("Access-Control-Allow-Origin", "*")

                path := r.URL.Path
                if path == "/" || path == "" {
                        path = "/index.html"
                }

                // Try direct path in embed.FS first
                embedPath := "frontend" + path
                data, err := fs.ReadFile(frontendFS, embedPath)
                if err != nil {
                        // For requests with file extensions (CSS, JS, fonts, images) — DO NOT fallback.
                        // Return 404 if not found. Only fallback to index.html for extension-less routes (SPA).
                        ext := strings.ToLower(filepath.Ext(path))
                        if ext != "" && ext != ".html" {
                                http.Error(w, "Not Found", 404)
                                return
                        }

                        // Try with /index.html appended (Next.js trailingSlash convention)
                        altPath := "frontend" + strings.TrimSuffix(path, "/") + "/index.html"
                        if path == "/" {
                                altPath = "frontend/index.html"
                        }
                        data, err = fs.ReadFile(frontendFS, altPath)
                        if err != nil {
                                // SPA fallback — serve index.html for any unmatched route
                                data, err = fs.ReadFile(frontendFS, "frontend/index.html")
                                if err != nil {
                                        http.Error(w, "Not Found", 404)
                                        return
                                }
                                embedPath = "frontend/index.html"
                        }
                }

                // Set Content-Type based on file extension
                ext := strings.ToLower(filepath.Ext(embedPath))
                switch ext {
                case ".html":
                        w.Header().Set("Content-Type", "text/html; charset=utf-8")
                case ".css":
                        w.Header().Set("Content-Type", "text/css; charset=utf-8")
                case ".js":
                        w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
                case ".json":
                        w.Header().Set("Content-Type", "application/json; charset=utf-8")
                case ".svg":
                        w.Header().Set("Content-Type", "image/svg+xml")
                case ".png":
                        w.Header().Set("Content-Type", "image/png")
                case ".jpg", ".jpeg":
                        w.Header().Set("Content-Type", "image/jpeg")
                case ".woff2":
                        w.Header().Set("Content-Type", "font/woff2")
                case ".woff":
                        w.Header().Set("Content-Type", "font/woff")
                case ".txt":
                        w.Header().Set("Content-Type", "text/plain; charset=utf-8")
                case ".ico":
                        w.Header().Set("Content-Type", "image/x-icon")
                default:
                        w.Header().Set("Content-Type", "application/octet-stream")
                }

                // Cache static assets aggressively (Next.js _next/ has hashed filenames)
                if strings.HasPrefix(path, "/_next/") {
                        w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
                }

                w.Write(data)
        })

        addr := fmt.Sprintf("127.0.0.1:%d", port)
        listener, err := net.Listen("tcp", addr)
        if err != nil {
                // Try next port
                for p := port + 1; p < port+20; p++ {
                        addr = fmt.Sprintf("127.0.0.1:%d", p)
                        listener, err = net.Listen("tcp", addr)
                        if err == nil {
                                port = p
                                break
                        }
                }
                if err != nil {
                        return fmt.Errorf("cannot bind to port %d-%d: %w", port, port+20, err)
                }
        }

        logMsg("INFO", "HTTP server listening on http://%s", listener.Addr().String())
        go func() {
                if err := http.Serve(listener, mux); err != nil {
                        logMsg("ERROR", "HTTP server error: %v", err)
                }
        }()

        // Auto-open browser after small delay
        go func() {
                time.Sleep(500 * time.Millisecond)
                url := fmt.Sprintf("http://127.0.0.1:%d", port)
                openBrowser(url)
        }()

        return nil
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG PERSISTENCE — %APPDATA%/HyperA/config.json on Windows
// ═══════════════════════════════════════════════════════════════════════════════

func getConfigPath() string {
        var configDir string
        switch runtime.GOOS {
        case "windows":
                appData := os.Getenv("APPDATA")
                if appData == "" {
                        appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
                }
                configDir = filepath.Join(appData, "HyperA")
        case "darwin":
                home, _ := os.UserHomeDir()
                configDir = filepath.Join(home, "Library", "Application Support", "HyperA")
        default:
                home, _ := os.UserHomeDir()
                configDir = filepath.Join(home, ".config", "hypera")
        }
        return filepath.Join(configDir, "config.json")
}

func loadConfig() Config {
        cfg := *DefaultConfig()
        configPath := getConfigPath()
        data, err := os.ReadFile(configPath)
        if err != nil {
                logMsg("INFO", "No config file at %s — using defaults", configPath)
                return cfg
        }

        var saved map[string]interface{}
        if err := json.Unmarshal(data, &saved); err != nil {
                logMsg("WARN", "Config file invalid — using defaults: %v", err)
                return cfg
        }

        // Apply saved config values
        applyConfigMap(&cfg, saved)
        logMsg("INFO", "Config loaded from %s", configPath)
        return cfg
}

func saveConfig(cfg Config) error {
        configPath := getConfigPath()
        if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
                return err
        }
        data, err := json.MarshalIndent(cfg, "", "  ")
        if err != nil {
                return err
        }
        return os.WriteFile(configPath, data, 0600)
}

// ═══════════════════════════════════════════════════════════════════════════════
// BROWSER LAUNCHER
// ═══════════════════════════════════════════════════════════════════════════════

func openBrowser(url string) {
        var err error
        switch runtime.GOOS {
        case "windows":
                err = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
        case "darwin":
                err = exec.Command("open", url).Start()
        default:
                err = exec.Command("xdg-open", url).Start()
        }
        if err != nil {
                logMsg("WARN", "Could not open browser: %v", err)
        }
}

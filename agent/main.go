// HyperA v0.1 — Go Trading Agent
// High-performance rewrite of the Python agent.
// Outputs JSON-prefixed lines on stdout for the Node.js bridge (server.ts).
// Reads CONFIG_UPDATE JSON lines from stdin.

package main

import (
        "bufio"
        "context"
        "encoding/json"
        "fmt"
        "io"
        "log"
        "math"
        "net/http"
        "os"
        "reflect"
        "sort"
        "strconv"
        "strings"
        "sync"
        "time"
)

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

type Config struct {
        // Credentials
        PrivateKey       string `json:"private_key"`
        AIAPIKey         string `json:"ai_api_key"`
        CryptopanicKey   string `json:"cryptopanic_api_key"`
        GlassnodeKey     string `json:"glassnode_api_key"`
        WhaleWallets     string `json:"whale_wallets"`
        // Network
        BaseURL string `json:"base_url"`
        // Trading
        Coin        string  `json:"coin"`
        OrderSizeUSD float64 `json:"order_size_usd"`
        StopLossPct  float64 `json:"stop_loss_pct"`
        TakeProfitPct float64 `json:"take_profit_pct"`
        Leverage     int     `json:"leverage"`
        // Analysis
        VolumeSpikeThreshold  float64 `json:"volume_spike_threshold"`
        WhaleMovementThreshold float64 `json:"whale_movement_threshold"`
        ActiveAddrSpikePct    float64 `json:"active_addr_spike_pct"`
        WindowSeconds         int     `json:"window_seconds"`
        MinConfidence         int     `json:"min_confidence"`
        DirectionScoreMargin  float64 `json:"direction_score_margin"`
        SignalFlipCooldownSec int     `json:"signal_flip_cooldown_sec"`
        // Loop
        LoopIntervalSec       int `json:"loop_interval_sec"`
        CooldownAfterTradeSec int `json:"cooldown_after_trade_sec"`
        // Signal thresholds
        FundingRateExtreme float64 `json:"funding_rate_extreme"`
        OISpikePct         float64 `json:"oi_spike_pct"`
        OBImbalanceRatio   float64 `json:"ob_imbalance_ratio"`
        OBWallUSD          float64 `json:"ob_wall_usd"`
        MomentumShiftPct   float64 `json:"momentum_shift_pct"`
        LiqCascadeUSD      float64 `json:"liq_cascade_usd"`
        // Whale tracking
        WhaleTrackEnabled   bool    `json:"whale_track_enabled"`
        HypurrscanAPI       string  `json:"hypurrscan_api"`
        HLMainnetAPI        string  `json:"hl_mainnet_api"`
        TopWalletsCount     int     `json:"top_wallets_count"`
        SentimentRefreshSec int     `json:"sentiment_refresh_sec"`
        SentimentWeight     float64 `json:"sentiment_weight"`
        TopTradersTableSize int     `json:"top_traders_table_size"`
        // Risk
        MaxDailyLossUSD float64 `json:"max_daily_loss_usd"`
        // OFI
        OFIWindowSec     int     `json:"ofi_window_sec"`
        OFIStrongThresh  float64 `json:"ofi_strong_thresh"`
        OFIExtremeThresh float64 `json:"ofi_extreme_thresh"`
        // CVD
        CVDDivergencePct   float64 `json:"cvd_divergence_pct"`
        CVDLookbackShapshots int   `json:"cvd_lookback_snapshots"`
        // Volatility
        VolatilityLookback int     `json:"volatility_lookback"`
        VolatilityLowPct   float64 `json:"volatility_low_pct"`
        VolatilityHighPct  float64 `json:"volatility_high_pct"`
        // Perp Premium
        PerpPremiumThreshold float64 `json:"perp_premium_threshold"`
        PerpPremiumExtreme   float64 `json:"perp_premium_extreme"`
        // Mean Reversion
        MeanReversionLookback int     `json:"mean_reversion_lookback"`
        MeanReversionStdMult  float64 `json:"mean_reversion_std_mult"`
        // Trailing TP
        TrailingTPActivationPct float64 `json:"trailing_tp_activation_pct"`
        TrailingTPDistancePct   float64 `json:"trailing_tp_distance_pct"`
        TrailingTPStepPct       float64 `json:"trailing_tp_step_pct"`
        // Funding
        FundingPeriodHours   float64 `json:"funding_period_hours"`
        FundingWarningMinutes float64 `json:"funding_warning_minutes"`
        // Liquidation
        LiqTrackEnabled  bool    `json:"liq_track_enabled"`
        LiqRefreshSec    int     `json:"liq_refresh_sec"`
        LiqMinClusterSize int   `json:"liq_min_cluster_size"`
        LiqClusterRangePct float64 `json:"liq_cluster_range_pct"`
        // Circuit Breaker
        CBEnabled              bool    `json:"cb_enabled"`
        CBMaxDailyLossPct      float64 `json:"cb_max_daily_loss_pct"`
        CBMaxConsecutiveLosses int     `json:"cb_max_consecutive_losses"`
        CBMaxDrawdownPct       float64 `json:"cb_max_drawdown_pct"`
        CBCooldownMinutes      int     `json:"cb_cooldown_minutes"`
        // AI Engine
        AIEngineEnabled bool    `json:"ai_engine_enabled"`
        AIAPIURL        string  `json:"ai_api_url"`
        AIModel         string  `json:"ai_model"`
        AITemperature   float64 `json:"ai_temperature"`
        AIMaxTokens     int     `json:"ai_max_tokens"`
        AIRefreshSec    int     `json:"ai_refresh_sec"`
        // Backtest
        BacktestEnabled       bool    `json:"backtest_enabled"`
        BacktestInitBalance   float64 `json:"backtest_init_balance"`
        BacktestMaxSnapshots  int     `json:"backtest_max_snapshots"`
        BacktestCandleInterval string `json:"backtest_candle_interval"`
        BacktestCandleLimit   int     `json:"backtest_candle_limit"`
        BacktestSLPct         float64 `json:"backtest_sl_pct"`
        BacktestTPPct         float64 `json:"backtest_tp_pct"`
        BacktestFeeRate       float64 `json:"backtest_fee_rate"`
        // Sentiment v2
        SentimentV2Enabled bool   `json:"sentiment_v2_enabled"`
        FearGreedAPI       string `json:"fear_greed_api"`
        CryptopanicAPI     string `json:"cryptopanic_api"`
        // Signal Ranking
        SignalRankingEnabled    bool    `json:"signal_ranking_enabled"`
        SignalRankingRefreshSec int     `json:"signal_ranking_refresh_sec"`
        SignalRankingTopN       int     `json:"signal_ranking_top_n"`
        // On-Chain
        OnchainEnabled    bool `json:"onchain_enabled"`
        OnchainRefreshSec int  `json:"onchain_refresh_sec"`
        // Risk 2.0
        RiskVARConfidence float64 `json:"risk_var_confidence"`
        RiskKellyFraction float64 `json:"risk_kelly_fraction"`
        RiskMaxLeverage   int     `json:"risk_max_leverage"`
        RiskMaxPositionPct float64 `json:"risk_max_position_pct"`
        // Strategy Rotation
        RegimeLookback        int     `json:"regime_lookback"`
        RegimeTrendADXThreshold float64 `json:"regime_trend_adx_threshold"`
        // Trigger Mode — main entry signals
        TriggerModeEnabled bool `json:"trigger_mode_enabled"` // when true, bot uses Hurst+BB triggers as primary entry
        // Exit protection
        ExitOnlyOnSLTP   bool    `json:"exit_only_on_sltp"`    // when true, positions only close on SL/TP, not signal reversal
        MinHoldMinutes   float64 `json:"min_hold_minutes"`     // minimum minutes before signal-reversal exit allowed (0 = disabled)
}

func DefaultConfig() *Config {
        return &Config{
                PrivateKey:       os.Getenv("PRIVATE_KEY"),
                AIAPIKey:         os.Getenv("AI_API_KEY"),
                CryptopanicKey:   os.Getenv("CRYPTOPANIC_API_KEY"),
                GlassnodeKey:     os.Getenv("GLASSNODE_API_KEY"),
                WhaleWallets:     os.Getenv("WHALE_WALLETS"),
                BaseURL:          "https://api.hyperliquid.xyz",
                Coin:             "BTC",
                OrderSizeUSD:     10.0,
                StopLossPct:      1.5,
                TakeProfitPct:    4.5,
                Leverage:         3,
                VolumeSpikeThreshold:  50.0,
                WhaleMovementThreshold: 100000,
                ActiveAddrSpikePct:    30.0,
                WindowSeconds:         300,
                MinConfidence:         60,
                DirectionScoreMargin:  1.5,
                SignalFlipCooldownSec: 60,
                LoopIntervalSec:       10,
                CooldownAfterTradeSec: 120,
                FundingRateExtreme:    0.0005,
                OISpikePct:            5.0,
                OBImbalanceRatio:      3.0,
                OBWallUSD:             2000000,
                MomentumShiftPct:      0.3,
                LiqCascadeUSD:         500000,
                WhaleTrackEnabled:     true,
                HypurrscanAPI:         "https://api.hypurrscan.io",
                HLMainnetAPI:          "https://api.hyperliquid.xyz",
                TopWalletsCount:       50,
                SentimentRefreshSec:   120,
                SentimentWeight:       20.0,
                TopTradersTableSize:   50,
                MaxDailyLossUSD:       50.0,
                OFIWindowSec:          60,
                OFIStrongThresh:       500000,
                OFIExtremeThresh:      2000000,
                CVDDivergencePct:      0.15,
                CVDLookbackShapshots:  20,
                VolatilityLookback:    30,
                VolatilityLowPct:      0.10,
                VolatilityHighPct:     0.60,
                PerpPremiumThreshold:  0.05,
                PerpPremiumExtreme:    0.15,
                MeanReversionLookback: 30,
                MeanReversionStdMult:  2.0,
                TrailingTPActivationPct: 2.0,
                TrailingTPDistancePct:   0.8,
                TrailingTPStepPct:       0.3,
                FundingPeriodHours:   8.0,
                FundingWarningMinutes: 30.0,
                LiqTrackEnabled:      true,
                LiqRefreshSec:        30,
                LiqMinClusterSize:    3,
                LiqClusterRangePct:   0.5,
                CBEnabled:            true,
                CBMaxDailyLossPct:    5.0,
                CBMaxConsecutiveLosses: 5,
                CBMaxDrawdownPct:     10.0,
                CBCooldownMinutes:    30,
                AIEngineEnabled:      false,
                AIAPIURL:             "https://api.openai.com/v1/chat/completions",
                AIModel:              "gpt-4o-mini",
                AITemperature:        0.3,
                AIMaxTokens:          500,
                AIRefreshSec:         60,
                BacktestEnabled:      false,
                BacktestInitBalance:  10000.0,
                BacktestMaxSnapshots: 1000,
                BacktestCandleInterval: "1h",
                BacktestCandleLimit:   1500,
                BacktestSLPct:        1.5,
                BacktestTPPct:        4.5,
                BacktestFeeRate:      0.00035,
                SentimentV2Enabled:   true,
                FearGreedAPI:         "https://api.alternative.me/fng/",
                CryptopanicAPI:       "https://cryptopanic.com/api/v1/posts/",
                SignalRankingEnabled:    true,
                SignalRankingRefreshSec: 60,
                SignalRankingTopN:       20,
                OnchainEnabled:       true,
                OnchainRefreshSec:    300,
                RiskVARConfidence:    0.95,
                RiskKellyFraction:    0.5,
                RiskMaxLeverage:      10,
                RiskMaxPositionPct:   30.0,
                RegimeLookback:       50,
                RegimeTrendADXThreshold: 25.0,
                ExitOnlyOnSLTP:    true,    // in trigger mode, only exit on SL/TP
                MinHoldMinutes:    5.0,     // minimum 5 min hold before signal reversal exit
                TriggerModeEnabled: true,   // DCA Hurst+BB strategy enabled by default
        }
}

// ApplyStdinUpdate applies a CONFIG_UPDATE from stdin
func (c *Config) ApplyStdinUpdate(update map[string]interface{}) {
        if v, ok := update["order_size_usd"]; ok {
                if f, err := toFloat(v); err == nil { c.OrderSizeUSD = f }
        }
        if v, ok := update["leverage"]; ok {
                if f, err := toFloat(v); err == nil { c.Leverage = int(f) }
        }
        if v, ok := update["stop_loss_pct"]; ok {
                if f, err := toFloat(v); err == nil { c.StopLossPct = f }
        }
        if v, ok := update["take_profit_pct"]; ok {
                if f, err := toFloat(v); err == nil { c.TakeProfitPct = f }
        }
        if v, ok := update["min_confidence"]; ok {
                if f, err := toFloat(v); err == nil { c.MinConfidence = int(f) }
        }
        if v, ok := update["loop_interval_sec"]; ok {
                if f, err := toFloat(v); err == nil { c.LoopIntervalSec = int(f) }
        }
        if v, ok := update["cooldown_after_trade_sec"]; ok {
                if f, err := toFloat(v); err == nil { c.CooldownAfterTradeSec = int(f) }
        }
        if v, ok := update["signal_flip_cooldown_sec"]; ok {
                if f, err := toFloat(v); err == nil { c.SignalFlipCooldownSec = int(f) }
        }
        if v, ok := update["ai_api_key"]; ok {
                if s, ok := v.(string); ok && s != "" { c.AIAPIKey = s }
        }
        if v, ok := update["ai_engine_enabled"]; ok {
                if b, ok := v.(bool); ok { c.AIEngineEnabled = b }
        }
        if v, ok := update["cb_enabled"]; ok {
                if b, ok := v.(bool); ok { c.CBEnabled = b }
        }
        if v, ok := update["cb_max_daily_loss_pct"]; ok {
                if f, err := toFloat(v); err == nil { c.CBMaxDailyLossPct = f }
        }
        if v, ok := update["cb_max_consecutive_losses"]; ok {
                if f, err := toFloat(v); err == nil { c.CBMaxConsecutiveLosses = int(f) }
        }
        if v, ok := update["cb_max_drawdown_pct"]; ok {
                if f, err := toFloat(v); err == nil { c.CBMaxDrawdownPct = f }
        }
        if v, ok := update["cb_cooldown_minutes"]; ok {
                if f, err := toFloat(v); err == nil { c.CBCooldownMinutes = int(f) }
        }
        if v, ok := update["trigger_mode_enabled"]; ok {
                if b, ok := v.(bool); ok { c.TriggerModeEnabled = b }
        }
        if v, ok := update["exit_only_on_sltp"]; ok {
                if b, ok := v.(bool); ok { c.ExitOnlyOnSLTP = b }
        }
        if v, ok := update["min_hold_minutes"]; ok {
                if f, err := toFloat(v); err == nil { c.MinHoldMinutes = f }
        }
}

func toFloat(v interface{}) (float64, error) {
        switch val := v.(type) {
        case float64:
                return val, nil
        case int:
                return float64(val), nil
        case json.Number:
                return val.Float64()
        case string:
                return strconv.ParseFloat(val, 64)
        default:
                return 0, fmt.Errorf("cannot convert %T to float", v)
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

type Signal struct {
        Direction  string   `json:"direction"`
        Confidence float64  `json:"confidence"`
        Reasons    []string `json:"reasons"`
}

type SignalState struct {
        Active    bool   `json:"active"`
        Direction string `json:"direction"`
        Value     string `json:"value"`
}

type MarketSnapshot struct {
        Iteration         int     `json:"iteration"`
        Coin              string  `json:"coin"`
        Price             float64 `json:"price"`
        Volume            float64 `json:"volumeUsd"`
        ActiveAddresses   int     `json:"active_addresses"`
        WhaleCount        int     `json:"whale_count"`
        FundingRate       float64 `json:"fundingRate"`
        OpenInterest      float64 `json:"openInterest"`
        OIChangePct       float64 `json:"oiChangePct"`
        MarkPx            float64 `json:"markPx"`
        PrevDayPx         float64 `json:"prevDayPx"`
        BidDepth          float64 `json:"bidDepth"`
        AskDepth          float64 `json:"askDepth"`
        OBImbalance       float64 `json:"obImbalance"`
        OBWallSize        float64 `json:"obWallSize"`
        OBWallSide        string  `json:"obWallSide"`
        OFINet            float64 `json:"ofiNet"`
        OFIBidDelta       float64 `json:"ofiBidDelta"`
        OFIAskDelta       float64 `json:"ofiAskDelta"`
        CVD               float64 `json:"cvdValue"`
        CVDDivergence     float64 `json:"cvdDivergence"`
        VolatilityRegime  string  `json:"volatilityRegime"`
        VolatilityPct     float64 `json:"volatilityPct"`
        PerpPremiumPct    float64 `json:"perpPremiumPct"`
        PerpPremiumLabel  string  `json:"perpPremiumLabel"`
        PriceZscore       float64 `json:"priceZscore"`
        MeanReversionSignal string `json:"meanReversionSignal"`
        FundingCountdownMin float64 `json:"fundingCountdownMin"`
        FundingNear       bool    `json:"fundingNear"`
        // Technical indicators
        RSI           float64 `json:"rsi"`
        MACDLine      float64 `json:"macdLine"`
        MACDSignal    float64 `json:"macdSignal"`
        MACDHistogram float64 `json:"macdHistogram"`
        BBUpper       float64 `json:"bbUpper"`
        BBMiddle      float64 `json:"bbMiddle"`
        BBLower       float64 `json:"bbLower"`
        BBBandwidth   float64 `json:"bbBandwidth"`
        ChartSource   string  `json:"chartSource"`
        // Sentiment
        SentimentScore        float64 `json:"sentiment_score"`
        SentimentLabel        string  `json:"sentiment_label"`
        WhaleLongRatio        float64 `json:"whale_long_ratio"`
        WhaleTotalPositions   int     `json:"whale_total_positions"`
        WhaleTotalValueUSD    float64 `json:"whale_total_value_usd"`
        WalletsLongCount      int     `json:"wallets_long_count"`
        WalletsShortCount     int     `json:"wallets_short_count"`
        WalletsNeutralCount   int     `json:"wallets_neutral_count"`
        VolatilityMultiplier  float64 `json:"volatilityMultiplier"`
}

type WhalePosition struct {
        Wallet     string  `json:"wallet"`
        Coin       string  `json:"coin"`
        Side       string  `json:"side"`
        SizeUSD    float64 `json:"size_usd"`
        EntryPrice float64 `json:"entry_price"`
        PnL        float64 `json:"pnl"`
        Leverage   float64 `json:"leverage"`
        AccountValue float64 `json:"account_value"`
}

type TraderProfile struct {
        Wallet       string  `json:"wallet"`
        AccountValue float64 `json:"account_value"`
        LongUSD      float64 `json:"long_usd"`
        ShortUSD     float64 `json:"short_usd"`
        LongCount    int     `json:"long_count"`
        ShortCount   int     `json:"short_count"`
        NetBias      float64 `json:"net_bias"`
        DominantSide string  `json:"dominant_side"`
        TotalUSD     float64 `json:"total_usd"`
        TopPositions []WhalePosition `json:"top_positions"`
}

type MarketSentiment struct {
        Score             float64 `json:"score"`
        Label             string  `json:"label"`
        LongRatio         float64 `json:"long_ratio"`
        TotalPositions    int     `json:"total_positions"`
        TotalValueUSD     float64 `json:"total_value_usd"`
        WalletsScanned    int     `json:"wallets_scanned"`
        WalletsLongCount  int     `json:"wallets_long_count"`
        WalletsShortCount int     `json:"wallets_short_count"`
        WalletsNeutralCount int   `json:"wallets_neutral_count"`
        TopPositions      []WhalePosition  `json:"top_positions"`
        TraderProfiles    []TraderProfile  `json:"trader_profiles"`
}

type PaperPosition struct {
        Coin      string    `json:"coin"`
        Side      string    `json:"side"`
        EntryPrice float64   `json:"entryPrice"`
        SizeUSD   float64   `json:"sizeUsd"`
        UnrealizedPnL float64 `json:"unrealizedPnl"`
        StopLoss  float64   `json:"stopLoss"`
        TakeProfit float64  `json:"takeProfit"`
        Leverage  int       `json:"leverage"`
        PeakPrice float64   `json:"peakPrice"`
        TrailingActive bool `json:"trailingActive"`
        DCAEntry  int       `json:"dcaEntry"` // DCA entry level: 1, 2, or 3 (0 = not DCA)
        DCAMult   float64   `json:"dcaMult"`  // DCA size multiplier: 1, 2, or 4
        OpenedAt  time.Time `json:"-"`
}

type PaperTrade struct {
        Coin     string  `json:"coin"`
        Side     string  `json:"side"`
        EntryPx  float64 `json:"entryPrice"`
        ExitPx   float64 `json:"exitPrice"`
        SizeUSD  float64 `json:"sizeUsd"`
        PnL      float64 `json:"pnl"`
        Fee      float64 `json:"fee"`
        Time     string  `json:"time"`
}

// Circuit Breaker
type CircuitBreakerState struct {
        Active              bool    `json:"is_active"`
        Reason              string  `json:"reason"`
        TriggeredAt         string  `json:"triggered_at"`
        DailyLossPct        float64 `json:"daily_loss_pct"`
        ConsecutiveLosses   int     `json:"consecutive_losses"`
        DrawdownPct         float64 `json:"current_drawdown_pct"`
        CooldownRemainingMin float64 `json:"cooldown_remaining_min"`
        Thresholds          map[string]float64 `json:"thresholds"`
}

// Market Regime
type MarketRegime struct {
        Regime              string  `json:"regime"`
        Confidence          float64 `json:"confidence"`
        ADX                 float64 `json:"adx"`
        ATRPct              float64 `json:"atrPct"`
        RecommendedStrategy string  `json:"recommendedStrategy"`
        PositionMultiplier  float64 `json:"positionMultiplier"`
        StopLossMultiplier  float64 `json:"stopLossMultiplier"`
}

// Risk Metrics
type RiskMetrics struct {
        VaR95              float64 `json:"var_95"`
        KellyCriterion     float64 `json:"kelly_size_pct"`
        CurrentLeverage    float64 `json:"current_leverage"`
        PositionConcentration float64 `json:"position_concentration"`
        DailyVaRUsedPct    float64 `json:"daily_var_used_pct"`
        CompositeRiskScore float64 `json:"risk_score"`
}

// Enhanced Sentiment
type EnhancedSentiment struct {
        FearGreedIndex   int     `json:"fearGreedIndex"`
        FearGreedLabel   string  `json:"fearGreedLabel"`
        NewsSentiment    float64 `json:"newsSentiment"`
        NewsBullishCount int     `json:"newsBullishCount"`
        NewsBearishCount int     `json:"newsBearishCount"`
        CombinedScore    float64 `json:"combinedScore"`
        Sources          []string `json:"sources"`
}

// Liquidation
type LiquidationCluster struct {
        Price    float64 `json:"price"`
        Side     string  `json:"side"`
        TotalUSD float64 `json:"totalUsd"`
        Count    int     `json:"count"`
        Intensity string `json:"intensity"`
}

type LiquidationMap struct {
        Clusters        []LiquidationCluster `json:"clusters"`
        TotalClusters   int                  `json:"totalClusters"`
        CascadeDetected bool                 `json:"cascadeDetected"`
}

// Signal Ranking — top crypto by volume with signal summary
type TimeframeData struct {
        PriceChangePct float64 `json:"priceChangePct"`
        Volume         float64 `json:"volume"`         // volume in this timeframe (USD)
        RSI            float64 `json:"rsi,omitempty"`  // RSI(14) for this TF
        BBPosition     float64 `json:"bbPosition,omitempty"` // 0=lower, 50=mid, 100=upper
        Signal         string  `json:"signal"`          // LONG / SHORT / NEUTRAL
        SignalStrength int     `json:"signalStrength"`  // 0-100
        SignalReason   string  `json:"signalReason"`
}

type SignalRankingEntry struct {
        Rank           int                        `json:"rank"`
        Coin           string                     `json:"coin"`
        Price          float64                    `json:"price"`
        Volume24h      float64                    `json:"volume24h"`
        OpenInterest   float64                    `json:"openInterest"`
        FundingRate    float64                    `json:"fundingRate"`
        FundingAnnual  float64                    `json:"fundingAnnual"`
        OIChangePct    float64                    `json:"oiChangePct"`
        Timeframes     map[string]*TimeframeData  `json:"timeframes"` // "30m","1h","2h","4h","12h","24h"
        // Computed from active timeframe (24h default)
        Signal         string  `json:"signal"`
        SignalStrength int     `json:"signalStrength"`
        SignalReason   string  `json:"signalReason"`
}

type SignalRanking struct {
        Entries    []SignalRankingEntry `json:"entries"`
        TotalCoins int                  `json:"totalCoins"`
        UpdatedAt  string               `json:"updatedAt"`
}

// On-Chain Metrics
type OnChainMetrics struct {
        ExchangeNetFlow      float64 `json:"exchangeNetFlow"`
        MVRVZScore          float64 `json:"mvrvZScore"`
        NUPL                float64 `json:"nupl"`
        ActiveAddresses24h  int     `json:"activeAddresses24h"`
        TransactionVolumeUSD float64 `json:"transactionVolumeUsd"`
        WhaleHodlingTrend   string  `json:"whaleHodlingTrend"`
        OverallSignal       string  `json:"overallSignal"`
        // Hyperliquid-specific on-chain
        HLOpenInterestUSD   float64 `json:"hlOpenInterestUsd"`
        HLOIChangePct       float64 `json:"hlOiChangePct"`
        HLFundingRate       float64 `json:"hlFundingRate"`
        HLFundingNextHours  float64 `json:"hlFundingNextHours"`
        HLLiquidation24h    float64 `json:"hlLiquidation24h"`
        HLPremiumIndex      float64 `json:"hlPremiumIndex"`
        // Derived signals
        OISignal            string  `json:"oiSignal"`
        FundingSignal       string  `json:"fundingSignal"`
        LiquidationSignal   string  `json:"liquidationSignal"`
        DataSource          string  `json:"dataSource"`
}

// AI Decision
type AIDecision struct {
        Direction      string   `json:"direction"`
        Confidence     float64  `json:"confidence"`
        Reasoning      string   `json:"reasoning"`
        Strategy       string   `json:"strategy"`
        RiskAssessment string   `json:"risk_assessment"`
        KeyFactors     []string `json:"key_factors"`
}

// ═══════════════════════════════════════════════════════════════════════════════
// JSON STDOUT BRIDGE
// ═══════════════════════════════════════════════════════════════════════════════

var stdoutMu sync.Mutex
var globalAgent *Agent // used by emitJSON to broadcast to WS clients

// sanitizeJSON recursively walks maps, slices, and floats inside v and
// replaces any NaN / +Inf / -Inf with 0 so json.Marshal never fails with
// "json: unsupported value: NaN". This is defense-in-depth: business logic
// should already guard divisions, but this guarantees the WebSocket stream
// never breaks for clients.
func sanitizeJSON(v interface{}) interface{} {
        switch x := v.(type) {
        case float64:
                if math.IsNaN(x) || math.IsInf(x, 0) {
                        return 0.0
                }
                return x
        case float32:
                if math.IsNaN(float64(x)) || math.IsInf(float64(x), 0) {
                        return float32(0)
                }
                return x
        case map[string]interface{}:
                for k, val := range x {
                        x[k] = sanitizeJSON(val)
                }
                return x
        case []interface{}:
                for i, val := range x {
                        x[i] = sanitizeJSON(val)
                }
                return x
        case []map[string]interface{}:
                for i, val := range x {
                        x[i] = sanitizeJSON(val).(map[string]interface{})
                }
                return x
        case []float64:
                for i, val := range x {
                        if math.IsNaN(val) || math.IsInf(val, 0) {
                                x[i] = 0
                        }
                }
                return x
        default:
                // Reflection fallback: catches typed slices like []PaperTrade,
                // []PaperPosition, and any struct that snuck through without being
                // converted to map[string]interface{}. Without this, NaN values in
                // struct fields would leak straight to json.Marshal and fail with
                // "json: unsupported value: NaN".
                return sanitizeReflect(v)
        }
}

// sanitizeReflect handles types that the type-switch in sanitizeJSON doesn't
// catch: arbitrary typed slices/arrays ([]PaperTrade, []PaperPosition, etc.),
// structs, and pointers. It recursively sanitizes float64 fields/elements.
// Slices/arrays are converted to []interface{} (JSON-compatible). Structs are
// converted to map[string]interface{} using their json tags so the wire format
// matches what direct json.Marshal would produce.
func sanitizeReflect(v interface{}) interface{} {
        if v == nil {
                return nil
        }
        rv := reflect.ValueOf(v)
        switch rv.Kind() {
        case reflect.Slice, reflect.Array:
                // Build []interface{} so nested struct elements get sanitized too.
                // The resulting JSON is identical to marshaling the typed slice
                // directly (modulo NaN/Inf replacement).
                out := make([]interface{}, rv.Len())
                for i := 0; i < rv.Len(); i++ {
                        elem := rv.Index(i).Interface()
                        out[i] = sanitizeJSON(elem)
                }
                return out
        case reflect.Struct:
                // Convert struct → map[string]interface{} using json tags.
                // This guarantees every float64 field is sanitized.
                out := make(map[string]interface{})
                rt := rv.Type()
                for i := 0; i < rv.NumField(); i++ {
                        field := rt.Field(i)
                        // Skip unexported fields
                        if field.PkgPath != "" {
                                continue
                        }
                        jsonTag := field.Tag.Get("json")
                        if jsonTag == "-" {
                                continue
                        }
                        name := field.Name
                        if jsonTag != "" {
                                parts := strings.SplitN(jsonTag, ",", 2)
                                if parts[0] != "" {
                                        name = parts[0]
                                }
                        }
                        out[name] = sanitizeJSON(rv.Field(i).Interface())
                }
                return out
        case reflect.Ptr:
                if rv.IsNil() {
                        return nil
                }
                return sanitizeJSON(rv.Elem().Interface())
        case reflect.Map:
                // Generic map[string]T → map[string]interface{}
                out := make(map[string]interface{})
                for _, key := range rv.MapKeys() {
                        out[fmt.Sprintf("%v", key.Interface())] = sanitizeJSON(rv.MapIndex(key).Interface())
                }
                return out
        default:
                return v
        }
}

func emitJSON(prefix string, v interface{}) {
        v = sanitizeJSON(v)
        data, err := json.Marshal(v)
        if err != nil {
                log.Printf("JSON marshal error for %s: %v", prefix, err)
                return
        }
        // HYP-007: use defer Unlock to guarantee mutex release even if Printf panics.
        // Previously a panic in fmt.Printf (or future code added between Lock/Unlock)
        // would leave stdoutMu locked forever, deadlocking all subsequent logMsg/emitJSON calls.
        stdoutMu.Lock()
        defer stdoutMu.Unlock()
        fmt.Printf("%s%s\n", prefix, string(data))
        // If agent has WS hub, broadcast state to all connected clients
        if globalAgent != nil && globalAgent.hub != nil && globalAgent.hub.ClientCount() > 0 {
                msg := map[string]interface{}{
                        "type":    "state",
                        "prefix":  prefix,
                        "payload": v,
                }
                if msgBytes, err := json.Marshal(msg); err == nil {
                        globalAgent.hub.Broadcast(msgBytes)
                }
        }
}

func logMsg(level, format string, args ...interface{}) {
        now := time.Now().UTC().Format("2006-01-02 15:04:05")
        msg := fmt.Sprintf(format, args...)
        stdoutMu.Lock()
        defer stdoutMu.Unlock()
        fmt.Printf("[%s] %s │ %s\n", now, level, msg)
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

var httpClient = &http.Client{Timeout: 15 * time.Second}

func httpPostJSON(url string, payload interface{}) (map[string]interface{}, error) {
        body, err := json.Marshal(payload)
        if err != nil {
                return nil, err
        }
        resp, err := httpClient.Post(url, "application/json", strings.NewReader(string(body)))
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        data, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, err
        }
        var result map[string]interface{}
        if err := json.Unmarshal(data, &result); err != nil {
                return nil, err
        }
        return result, nil
}

func httpGetJSON(url string) (map[string]interface{}, error) {
        resp, err := httpClient.Get(url)
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        data, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, err
        }
        var result map[string]interface{}
        if err := json.Unmarshal(data, &result); err != nil {
                return nil, err
        }
        return result, nil
}

func httpGetJSONArray(url string) ([]interface{}, error) {
        resp, err := httpClient.Get(url)
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        data, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, err
        }
        // Try to unmarshal as array first
        var result []interface{}
        if err := json.Unmarshal(data, &result); err != nil {
                // Binance sometimes returns an error object instead of an array
                // e.g. {"code": -1015, "msg": "Too many request weight used"}
                var errObj map[string]interface{}
                if jsonErr := json.Unmarshal(data, &errObj); jsonErr == nil {
                        if msg, ok := errObj["msg"].(string); ok {
                                return nil, fmt.Errorf("API error: %s", msg)
                        }
                }
                return nil, err
        }
        return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYPERLIQUID API CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

type HLClient struct {
        cfg    *Config
        baseURL string
}

func NewHLClient(cfg *Config) *HLClient {
        return &HLClient{cfg: cfg, baseURL: cfg.BaseURL}
}

// GetAllMids returns map coin→price string
func (h *HLClient) GetAllMids() (map[string]string, error) {
        result, err := httpPostJSON(h.baseURL+"/info", map[string]interface{}{"type": "allMids"})
        if err != nil {
                return nil, err
        }
        mids := make(map[string]string)
        for k, v := range result {
                if s, ok := v.(string); ok {
                        mids[k] = s
                }
        }
        return mids, nil
}

// GetMetaAndAssetCtxs returns universe + per-coin context data
func (h *HLClient) GetMetaAndAssetCtxs() ([]interface{}, []interface{}, error) {
        body, _ := json.Marshal(map[string]interface{}{"type": "metaAndAssetCtxs"})
        resp, err := httpClient.Post(h.baseURL+"/info", "application/json", strings.NewReader(string(body)))
        if err != nil {
                return nil, nil, err
        }
        defer resp.Body.Close()
        data, _ := io.ReadAll(resp.Body)

        // Response is [metaObj, ctxsArr]
        // metaObj = {"universe": [...], "marginTables": [...], ...}
        // ctxsArr = [{fundingRate, openInterest, markPx, ...}, ...]
        var raw []json.RawMessage
        if err := json.Unmarshal(data, &raw); err != nil {
                return nil, nil, err
        }

        var universe []interface{}
        if len(raw) > 0 {
                // raw[0] is a dict with "universe" key
                var metaObj map[string]interface{}
                if err := json.Unmarshal(raw[0], &metaObj); err == nil {
                        if u, ok := metaObj["universe"].([]interface{}); ok {
                                universe = u
                        }
                }
        }

        var ctxsArr []interface{}
        if len(raw) > 1 {
                json.Unmarshal(raw[1], &ctxsArr)
        }

        return universe, ctxsArr, nil
}

// GetL2Book returns order book levels
func (h *HLClient) GetL2Book(coin string) (bids, asks []map[string]interface{}, err error) {
        result, err := httpPostJSON(h.baseURL+"/info", map[string]interface{}{
                "type": "l2Book",
                "coin": coin,
        })
        if err != nil {
                return nil, nil, err
        }
        levels, ok := result["levels"].([]interface{})
        if !ok || len(levels) < 2 {
                return nil, nil, fmt.Errorf("unexpected l2Book format")
        }

        for _, l := range levels[0].([]interface{}) {
                if m, ok := l.(map[string]interface{}); ok {
                        bids = append(bids, m)
                }
        }
        for _, l := range levels[1].([]interface{}) {
                if m, ok := l.(map[string]interface{}); ok {
                        asks = append(asks, m)
                }
        }
        return bids, asks, nil
}

// GetClearinghouseState returns wallet positions and account value
func (h *HLClient) GetClearinghouseState(wallet string) (map[string]interface{}, error) {
        return httpPostJSON(h.baseURL+"/info", map[string]interface{}{
                "type": "clearinghouseState",
                "user": wallet,
        })
}

// ═══════════════════════════════════════════════════════════════════════════════
// BINANCE API (OHLCV candles)
// ═══════════════════════════════════════════════════════════════════════════════

type Candle struct {
        OpenTime int64
        Open     float64
        High     float64
        Low      float64
        Close    float64
        Volume   float64
}

// parseBinanceKlines converts raw Binance klines array to Candle slice.
func parseBinanceKlines(arr []interface{}) []Candle {
        var candles []Candle
        for _, item := range arr {
                if k, ok := item.([]interface{}); ok && len(k) >= 6 {
                        c := Candle{}
                        if v, ok := k[1].(string); ok { c.Open, _ = strconv.ParseFloat(v, 64) }
                        if v, ok := k[2].(string); ok { c.High, _ = strconv.ParseFloat(v, 64) }
                        if v, ok := k[3].(string); ok { c.Low, _ = strconv.ParseFloat(v, 64) }
                        if v, ok := k[4].(string); ok { c.Close, _ = strconv.ParseFloat(v, 64) }
                        if v, ok := k[5].(string); ok { c.Volume, _ = strconv.ParseFloat(v, 64) }
                        if v, ok := k[0].(json.Number); ok { c.OpenTime, _ = v.Int64() }
                        if v, ok := k[0].(float64); ok { c.OpenTime = int64(v) }
                        candles = append(candles, c)
                }
        }
        return candles
}

// intervalToMs maps a Binance interval string to milliseconds duration.
func intervalToMs(interval string) int64 {
        switch interval {
        case "1m": return 60_000
        case "5m": return 300_000
        case "15m": return 900_000
        case "30m": return 1_800_000
        case "1h": return 3_600_000
        case "2h": return 7_200_000
        case "4h": return 14_400_000
        case "12h": return 43_200_000
        case "1d": return 86_400_000
        default: return 3_600_000 // default 1h
        }
}

func fetchBinanceCandles(symbol, interval string, limit int) ([]Candle, error) {
        // Binance klines endpoint has a max of 1000 per request.
        // For limit > 1000, we paginate backwards using startTime.
        baseEndpoints := []string{
                "https://api.binance.com/api/v3/klines",
                "https://api.binance.us/api/v3/klines",
                "https://data-api.binance.vision/api/v3/klines",
        }

        msPerCandle := intervalToMs(interval)
        nowMs := time.Now().UnixMilli()

        var allCandles []Candle
        remaining := limit
        endMs := nowMs

        for remaining > 0 {
                batchSize := remaining
                if batchSize > 1000 {
                        batchSize = 1000
                }

                // Calculate startTime to get exactly batchSize candles ending at endMs
                startMs := endMs - int64(batchSize)*msPerCandle

                var arr []interface{}
                var err error
                for _, base := range baseEndpoints {
                        url := fmt.Sprintf("%s?symbol=%s&interval=%s&limit=%d&startTime=%d&endTime=%d",
                                base, symbol, interval, batchSize, startMs, endMs)
                        arr, err = httpGetJSONArray(url)
                        if err == nil && len(arr) > 0 {
                                break
                        }
                }
                if err != nil && len(allCandles) == 0 {
                        return nil, err
                }
                if len(arr) == 0 && len(allCandles) == 0 {
                        return nil, fmt.Errorf("all Binance endpoints returned empty data")
                }

                batch := parseBinanceKlines(arr)
                if len(batch) == 0 {
                        break
                }

                // Prepend batch (older candles first)
                allCandles = append(batch, allCandles...)
                remaining -= len(batch)

                // Move endMs to before the oldest candle in this batch
                if len(batch) > 0 {
                        endMs = batch[0].OpenTime - 1
                }

                // If we got fewer than requested, no more data available
                if len(batch) < batchSize {
                        break
                }

                // Rate limit: small delay between paginated requests
                time.Sleep(200 * time.Millisecond)
        }

        // Deduplicate by OpenTime (paginated requests may overlap)
        seen := make(map[int64]bool)
        var deduped []Candle
        for _, c := range allCandles {
                if !seen[c.OpenTime] {
                        seen[c.OpenTime] = true
                        deduped = append(deduped, c)
                }
        }

        return deduped, nil
}

// fetchHLCandles fetches candle data from Hyperliquid info API.
func fetchHLCandles(coin, interval string, limit int) ([]Candle, error) {
        // Hyperliquid candle snapshot API — returns an array directly
        msPerCandle := intervalToMs(interval)
        nowMs := time.Now().UnixMilli()
        startMs := nowMs - int64(limit)*msPerCandle

        hlInterval := interval
        switch interval {
        case "5m", "15m", "30m", "1h", "4h", "1d":
                hlInterval = interval
        default:
                hlInterval = "1h"
        }

        url := "https://api.hyperliquid.xyz/info"
        body, err := json.Marshal(map[string]interface{}{
                "type": "candleSnapshot",
                "req": map[string]interface{}{
                        "coin":      coin,
                        "interval":  hlInterval,
                        "startTime": startMs,
                },
        })
        if err != nil {
                return nil, err
        }

        resp, err := httpClient.Post(url, "application/json", strings.NewReader(string(body)))
        if err != nil {
                return nil, err
        }
        defer resp.Body.Close()
        data, err := io.ReadAll(resp.Body)
        if err != nil {
                return nil, err
        }

        // HL returns an array of candle objects directly
        var rawArr []map[string]interface{}
        if err := json.Unmarshal(data, &rawArr); err != nil {
                respPreview := string(data)
                if len(respPreview) > 200 { respPreview = respPreview[:200] }
                return nil, fmt.Errorf("HL candle parse error: %v (response: %s)", err, respPreview)
        }

        var candles []Candle
        for _, m := range rawArr {
                c := Candle{}
                // HL candleSnapshot format: {t: openTime, o: open, h: high, l: low, c: close, v: volume}
                // Times are in milliseconds
                if v, ok := m["t"].(float64); ok { c.OpenTime = int64(v) }
                if v, ok := m["T"].(float64); ok && c.OpenTime == 0 { c.OpenTime = int64(v) }
                if v, ok := m["o"].(string); ok { c.Open, _ = strconv.ParseFloat(v, 64) }
                if v, ok := m["h"].(string); ok { c.High, _ = strconv.ParseFloat(v, 64) }
                if v, ok := m["l"].(string); ok { c.Low, _ = strconv.ParseFloat(v, 64) }
                if v, ok := m["c"].(string); ok { c.Close, _ = strconv.ParseFloat(v, 64) }
                if v, ok := m["v"].(string); ok { c.Volume, _ = strconv.ParseFloat(v, 64) }
                if c.Close > 0 {
                        candles = append(candles, c)
                }
        }
        return candles, nil
}

// ═══════════════════════════════════════════════════════════════════════════════
// TECHNICAL INDICATORS
// ═══════════════════════════════════════════════════════════════════════════════

func calcEMA(data []float64, period int) []float64 {
        k := 2.0 / float64(period+1)
        ema := make([]float64, len(data))
        if len(data) == 0 { return ema }
        ema[0] = data[0]
        for i := 1; i < len(data); i++ {
                ema[i] = data[i]*k + ema[i-1]*(1-k)
        }
        return ema
}

func calcRSI(closes []float64, period int) []float64 {
        if len(closes) < period+1 { return nil }
        var avgGain, avgLoss float64
        for i := 1; i <= period; i++ {
                diff := closes[i] - closes[i-1]
                if diff >= 0 { avgGain += diff } else { avgLoss += -diff }
        }
        avgGain /= float64(period)
        avgLoss /= float64(period)
        rsi := make([]float64, len(closes))
        for i := 0; i < period; i++ { rsi[i] = math.NaN() }
        if avgLoss == 0 { rsi[period] = 100 } else { rsi[period] = 100 - 100/(1+avgGain/avgLoss) }
        for i := period + 1; i < len(closes); i++ {
                diff := closes[i] - closes[i-1]
                if diff > 0 { avgGain = (avgGain*float64(period-1) + diff) / float64(period) } else { avgGain = (avgGain * float64(period-1)) / float64(period) }
                if diff < 0 { avgLoss = (avgLoss*float64(period-1) + -diff) / float64(period) } else { avgLoss = (avgLoss * float64(period-1)) / float64(period) }
                if avgLoss == 0 { rsi[i] = 100 } else { rsi[i] = 100 - 100/(1+avgGain/avgLoss) }
        }
        return rsi
}

func calcMACD(closes []float64) (macdLine, signalLine, histogram []float64) {
        if len(closes) < 26 { return nil, nil, nil }
        ema12 := calcEMA(closes, 12)
        ema26 := calcEMA(closes, 26)
        for i := 25; i < len(closes); i++ {
                macdLine = append(macdLine, ema12[i]-ema26[i])
        }
        signalLine = calcEMA(macdLine, 9)
        startIdx := len(macdLine) - len(signalLine)
        for i := 0; i < len(signalLine); i++ {
                histogram = append(histogram, macdLine[startIdx+i]-signalLine[i])
        }
        return
}

func calcBollinger(closes []float64, period int, mult float64) (upper, middle, lower []float64) {
        if len(closes) < period { return nil, nil, nil }
        for i := period - 1; i < len(closes); i++ {
                window := closes[i-period+1 : i+1]
                sum := 0.0
                for _, v := range window { sum += v }
                mean := sum / float64(period)
                varSq := 0.0
                for _, v := range window { varSq += (v - mean) * (v - mean) }
                std := math.Sqrt(varSq / float64(period-1)) // sample std dev (N-1)
                upper = append(upper, mean+mult*std)
                middle = append(middle, mean)
                lower = append(lower, mean-mult*std)
        }
        return
}

// calcHCCCO computes the Hurst Cycle Channel Clone (LazyBear) oscillator.
// Returns fastOsc and slowOsc arrays (same length as input after warmup).
// This mirrors the client-side calcHCCCO in page.tsx exactly.
func calcHCCCO(closes, highs, lows []float64, scl_t, mcl_t int, scm, mcm float64) (fastOsc, slowOsc []float64) {
        n := len(closes)
        if n < mcl_t+5 || len(highs) < n || len(lows) < n {
                return nil, nil
        }

        scl := scl_t / 2
        mcl := mcl_t / 2
        scl2 := scl / 2
        mcl2 := mcl / 2

        // RMA (Running Moving Average)
        rma := func(src []float64, length int) []float64 {
                out := make([]float64, len(src))
                if len(src) < length {
                        return out
                }
                sum := 0.0
                for i := 0; i < length; i++ {
                        sum += src[i]
                }
                out[length-1] = sum / float64(length)
                alpha := 1.0 / float64(length)
                for i := length; i < len(src); i++ {
                        out[i] = alpha*src[i] + (1-alpha)*out[i-1]
                }
                return out
        }

        // True Range
        tr := make([]float64, n)
        tr[0] = highs[0] - lows[0]
        for i := 1; i < n; i++ {
                tr[i] = math.Max(highs[i]-lows[i], math.Max(math.Abs(highs[i]-closes[i-1]), math.Abs(lows[i]-closes[i-1])))
        }

        atrScl := rma(tr, scl)
        atrMcl := rma(tr, mcl)
        maScl := rma(closes, scl)
        maMcl := rma(closes, mcl)

        fastOsc = make([]float64, n)
        slowOsc = make([]float64, n)

        for i := 0; i < n; i++ {
                // Short cycle top/bottom (offset by scl2)
                sRef := closes[i]
                if i >= scl2 && maScl[i-scl2] != 0 {
                        sRef = maScl[i-scl2]
                }
                scOff := 0.0
                if atrScl[i] != 0 {
                        scOff = scm * atrScl[i]
                }
                sct := sRef + scOff
                scb := sRef - scOff
                scmm := (sct + scb) / 2.0

                // Medium cycle top/bottom (offset by mcl2)
                mRef := closes[i]
                if i >= mcl2 && maMcl[i-mcl2] != 0 {
                        mRef = maMcl[i-mcl2]
                }
                mcOff := 0.0
                if atrMcl[i] != 0 {
                        mcOff = mcm * atrMcl[i]
                }
                mct := mRef + mcOff
                mcb := mRef - mcOff

                denom := mct - mcb
                if denom != 0 {
                        slowOsc[i] = (scmm - mcb) / denom
                        fastOsc[i] = (closes[i] - mcb) / denom
                } else {
                        slowOsc[i] = 0.5
                        fastOsc[i] = 0.5
                }
        }

        // Skip warmup region
        warmup := mcl
        if warmup >= n {
                return nil, nil
        }
        fastOsc = fastOsc[warmup:]
        slowOsc = slowOsc[warmup:]
        return
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHALE / SENTIMENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

type SentimentEngine struct {
        cfg         *Config
        hl          *HLClient
        cached      *MarketSentiment
        lastRefresh time.Time
        mu          sync.Mutex
}

func NewSentimentEngine(cfg *Config, hl *HLClient) *SentimentEngine {
        return &SentimentEngine{cfg: cfg, hl: hl, cached: &MarketSentiment{}}
}

func (se *SentimentEngine) GetSentiment() *MarketSentiment {
        se.mu.Lock()
        defer se.mu.Unlock()
        if se.cached != nil && time.Since(se.lastRefresh).Seconds() < float64(se.cfg.SentimentRefreshSec) {
                return se.cached
        }
        // Refresh
        sentiment := se.refresh()
        se.cached = sentiment
        se.lastRefresh = time.Now()
        return sentiment
}

func (se *SentimentEngine) refresh() *MarketSentiment {
        sentiment := &MarketSentiment{}

        // 1) Fetch top wallets from Hypurrscan
        wallets := se.fetchTopWallets()
        if len(wallets) == 0 {
                logMsg("WARN", "Brak portfeli do analizy sentymentu")
                return sentiment
        }

        // Add manual whale wallets
        if se.cfg.WhaleWallets != "" {
                for _, w := range strings.Split(se.cfg.WhaleWallets, ",") {
                        w = strings.TrimSpace(w)
                        if w != "" {
                                found := false
                                for _, existing := range wallets {
                                        if existing == w { found = true; break }
                                }
                                if !found { wallets = append(wallets, w) }
                        }
                }
        }

        // 2) Fetch positions for each wallet
        allPositions := []WhalePosition{}
        traderProfiles := []TraderProfile{}
        walletsScanned := 0
        totalAccountValue := 0.0

        for _, wallet := range wallets {
                state, err := se.hl.GetClearinghouseState(wallet)
                if err != nil {
                        continue
                }
                // Parse account value
                var accountValue float64
                if ms, ok := state["marginSummary"].(map[string]interface{}); ok {
                        if av, ok := ms["accountValue"].(string); ok {
                                accountValue, _ = strconv.ParseFloat(av, 64)
                        }
                }

                // Parse positions
                positions := []WhalePosition{}
                var longUSD, shortUSD float64
                var longCount, shortCount int

                if ap, ok := state["assetPositions"].([]interface{}); ok {
                        for _, p := range ap {
                                if pm, ok := p.(map[string]interface{}); ok {
                                        pos, ok := pm["position"].(map[string]interface{})
                                        if !ok { continue }
                                        coin, _ := pos["coin"].(string)
                                        side := "LONG"
                                        if s, ok := pos["szi"].(string); ok {
                                                if sz, err := strconv.ParseFloat(s, 64); err == nil && sz < 0 {
                                                        side = "SHORT"
                                                }
                                        }
                                        var sizeUSD, entryPx, unrealizedPnl, leverage float64
                                        if v, ok := pos["positionValue"].(string); ok { sizeUSD, _ = strconv.ParseFloat(v, 64) }
                                        if v, ok := pos["entryPx"].(string); ok { entryPx, _ = strconv.ParseFloat(v, 64) }
                                        if v, ok := pos["unrealizedPnl"].(string); ok { unrealizedPnl, _ = strconv.ParseFloat(v, 64) }
                                        if v, ok := pos["leverage"].(map[string]interface{}); ok {
                                                if lv, ok := v["value"].(string); ok { leverage, _ = strconv.ParseFloat(lv, 64) }
                                        }
                                        // Short wallet address
                                        walletShort := wallet
                                        if len(wallet) > 8 { walletShort = wallet[:8] }

                                        wp := WhalePosition{
                                                Wallet: walletShort, Coin: coin, Side: side,
                                                SizeUSD: math.Abs(sizeUSD), EntryPrice: entryPx,
                                                PnL: unrealizedPnl, Leverage: leverage, AccountValue: accountValue,
                                        }
                                        positions = append(positions, wp)
                                        allPositions = append(allPositions, wp)

                                        if side == "LONG" { longUSD += math.Abs(sizeUSD); longCount++ }
                                        if side == "SHORT" { shortUSD += math.Abs(sizeUSD); shortCount++ }
                                }
                        }
                }

                if len(positions) > 0 {
                        walletsScanned++
                        totalAccountValue += accountValue
                        totalUSD := longUSD + shortUSD
                        var netBias float64
                        if totalUSD > 0 { netBias = (longUSD - shortUSD) / totalUSD }
                        dominantSide := "NEUTRAL"
                        if netBias > 0.15 { dominantSide = "LONG" }
                        if netBias < -0.15 { dominantSide = "SHORT" }

                        walletShort := wallet
                        if len(wallet) > 8 { walletShort = wallet[:8] }

                        // Sort positions by size (top 5)
                        sortPositionsBySize(positions)
                        topPos := positions
                        if len(topPos) > 5 { topPos = topPos[:5] }

                        traderProfiles = append(traderProfiles, TraderProfile{
                                Wallet: walletShort, AccountValue: accountValue,
                                LongUSD: longUSD, ShortUSD: shortUSD,
                                LongCount: longCount, ShortCount: shortCount,
                                NetBias: math.Round(netBias*1000) / 1000,
                                DominantSide: dominantSide, TotalUSD: totalUSD,
                                TopPositions: topPos,
                        })
                }

                // Rate limit: ~3 req/sec
                time.Sleep(350 * time.Millisecond)
        }

        // 3) Compute sentiment
        totalUSD := 0.0
        longTotalUSD := 0.0
        for _, p := range allPositions { totalUSD += p.SizeUSD }
        for _, tp := range traderProfiles { longTotalUSD += tp.LongUSD }

        var longRatio float64
        if totalUSD > 0 { longRatio = longTotalUSD / totalUSD }

        score := (longRatio - 0.5) * 200
        label := "NEUTRAL"
        if score > 60 { label = "EXTREME_BULL" } else if score > 20 { label = "BULLISH" }
        if score < -60 { label = "EXTREME_BEAR" } else if score < -20 { label = "BEARISH" }

        // Top 10 positions by size
        sortWhalePositionsBySize(allPositions)
        topPositions := allPositions
        if len(topPositions) > 10 { topPositions = topPositions[:10] }

        // Limit trader profiles
        if len(traderProfiles) > se.cfg.TopTradersTableSize {
                traderProfiles = traderProfiles[:se.cfg.TopTradersTableSize]
        }

        sentiment.Score = math.Round(score*10) / 10
        sentiment.Label = label
        sentiment.LongRatio = math.Round(longRatio*1000) / 1000
        sentiment.TotalPositions = len(allPositions)
        sentiment.TotalValueUSD = math.Round(totalUSD*100) / 100
        sentiment.WalletsScanned = walletsScanned
        sentiment.WalletsLongCount = countDominant(traderProfiles, "LONG")
        sentiment.WalletsShortCount = countDominant(traderProfiles, "SHORT")
        sentiment.WalletsNeutralCount = countDominant(traderProfiles, "NEUTRAL")
        sentiment.TopPositions = topPositions
        sentiment.TraderProfiles = traderProfiles

        logMsg("INFO", "📊 Sentyment: %s (%+.1f) │ Long ratio: %.1f%% │ Pozycji: %d │ Portfeli: %d │ Wartość: $%.0f",
                label, score, longRatio*100, len(allPositions), walletsScanned, totalUSD)

        return sentiment
}

func (se *SentimentEngine) fetchTopWallets() []string {
        url := fmt.Sprintf("%s/holdersWithLimit/USDC/%d", se.cfg.HypurrscanAPI, se.cfg.TopWalletsCount)
        result, err := httpGetJSON(url)
        if err != nil {
                logMsg("ERROR", "Hypurrscan fetch error: %v", err)
                return nil
        }
        holders, ok := result["holders"].(map[string]interface{})
        if !ok { return nil }

        // Sort by balance descending
        type kv struct { key string; val float64 }
        var sorted []kv
        for k, v := range holders {
                if f, ok := v.(float64); ok {
                        sorted = append(sorted, kv{k, f})
                }
        }
        // Simple sort
        for i := 0; i < len(sorted); i++ {
                for j := i + 1; j < len(sorted); j++ {
                        if sorted[j].val > sorted[i].val { sorted[i], sorted[j] = sorted[j], sorted[i] }
                }
        }

        var wallets []string
        for _, s := range sorted {
                // Skip system addresses
                if strings.HasPrefix(s.key, "0x0000") || strings.HasPrefix(s.key, "0xfff") { continue }
                wallets = append(wallets, s.key)
        }
        return wallets
}

func sortPositionsBySize(positions []WhalePosition) {
        for i := 0; i < len(positions); i++ {
                for j := i + 1; j < len(positions); j++ {
                        if positions[j].SizeUSD > positions[i].SizeUSD {
                                positions[i], positions[j] = positions[j], positions[i]
                        }
                }
        }
}

func sortWhalePositionsBySize(positions []WhalePosition) {
        for i := 0; i < len(positions); i++ {
                for j := i + 1; j < len(positions); j++ {
                        if positions[j].SizeUSD > positions[i].SizeUSD {
                                positions[i], positions[j] = positions[j], positions[i]
                        }
                }
        }
}

func countDominant(profiles []TraderProfile, side string) int {
        count := 0
        for _, tp := range profiles {
                if tp.DominantSide == side { count++ }
        }
        return count
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL ANALYSIS (17 signals)
// ═══════════════════════════════════════════════════════════════════════════════

type SignalAnalyzer struct {
        cfg             *Config
        prevSignal      *Signal
        lastSignalTime  time.Time
        snapshots       []MarketSnapshot
        prevBidDepth    float64
        prevAskDepth    float64
        prevPrice       float64
        prevOI          float64
        prevVolume      float64
        prevActiveAddr  int
        prevWhaleCount  int
        cvdAccum        float64
}

func NewSignalAnalyzer(cfg *Config) *SignalAnalyzer {
        return &SignalAnalyzer{cfg: cfg}
}

func (sa *SignalAnalyzer) Analyze(snap *MarketSnapshot, sentiment *MarketSentiment) (*Signal, map[string]SignalState) {
        var directionScore float64
        var confidence float64
        var reasons []string
        states := make(map[string]SignalState)
        activeCount := 0

        // --- 1) Volume Spike ---
        if sa.prevVolume > 0 && snap.Volume > 0 {
                changePct := (snap.Volume - sa.prevVolume) / sa.prevVolume * 100
                if math.Abs(changePct) > sa.cfg.VolumeSpikeThreshold {
                        strength := math.Min(math.Abs(changePct)/sa.cfg.VolumeSpikeThreshold, 2.0)
                        dir := math.Copysign(1, changePct)
                        directionScore += dir * strength
                        confidence += 25 * strength
                        states["Volume"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.0f%%", changePct)}
                        activeCount++
                        reasons = append(reasons, fmt.Sprintf("Vol spike %.0f%%", changePct))
                } else {
                        states["Volume"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.0f%%", changePct)}
                }
        }

        // --- 2) Whale Movement ---
        if sa.prevWhaleCount > 0 && snap.WhaleCount > 0 {
                change := float64(snap.WhaleCount - sa.prevWhaleCount)
                if math.Abs(change) > 0 {
                        dir := 1.0
                        if snap.Price < sa.prevPrice { dir = -1 }
                        strength := math.Min(math.Abs(change)/2.0, 2.0)
                        directionScore += dir * strength
                        confidence += 20 * strength
                        states["Whale Move"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%d whales", snap.WhaleCount)}
                        activeCount++
                        reasons = append(reasons, fmt.Sprintf("Whale move %d", snap.WhaleCount))
                } else {
                        states["Whale Move"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%d", snap.WhaleCount)}
                }
        }

        // --- 3) Active Address Spike ---
        if sa.prevActiveAddr > 0 && snap.ActiveAddresses > 0 {
                changePct := float64(snap.ActiveAddresses-sa.prevActiveAddr) / float64(sa.prevActiveAddr) * 100
                if math.Abs(changePct) > sa.cfg.ActiveAddrSpikePct {
                        strength := math.Min(math.Abs(changePct)/sa.cfg.ActiveAddrSpikePct, 2.0)
                        dir := math.Copysign(1, changePct)
                        directionScore += dir * strength
                        confidence += 15 * strength
                        states["Addr Spike"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.0f%%", changePct)}
                        activeCount++
                } else {
                        states["Addr Spike"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.0f%%", changePct)}
                }
        }

        // --- 4) Price Trend ---
        if sa.prevPrice > 0 {
                trendPct := (snap.Price - sa.prevPrice) / sa.prevPrice * 100
                if math.Abs(trendPct) > 0.5 {
                        dir := math.Copysign(1, trendPct)
                        directionScore += dir
                        confidence += 10
                        states["Price Trend"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.2f%%", trendPct)}
                        activeCount++
                } else {
                        states["Price Trend"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.2f%%", trendPct)}
                }
        }

        // --- 5) Funding Rate ---
        if math.Abs(snap.FundingRate) > 0 {
                strength := math.Min(math.Abs(snap.FundingRate)/sa.cfg.FundingRateExtreme, 2.0)
                if math.Abs(snap.FundingRate) > sa.cfg.FundingRateExtreme*0.5 {
                        // Contrarian: high FR = bearish
                        dir := -math.Copysign(1, snap.FundingRate)
                        directionScore += dir * strength
                        confidence += 20 * strength
                        states["Funding"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.6f", snap.FundingRate)}
                        activeCount++
                        reasons = append(reasons, fmt.Sprintf("FR %.6f", snap.FundingRate))
                } else {
                        states["Funding"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.6f", snap.FundingRate)}
                }
        }

        // --- 6) OI Spike ---
        if sa.prevOI > 0 && snap.OpenInterest > 0 {
                oiChange := (snap.OpenInterest - sa.prevOI) / sa.prevOI * 100
                if math.Abs(oiChange) > sa.cfg.OISpikePct {
                        priceDir := 1.0
                        if snap.Price < sa.prevPrice { priceDir = -1 }
                        oiDir := 1.0
                        if oiChange < 0 { oiDir = -1 }
                        dir := oiDir * priceDir
                        strength := math.Min(math.Abs(oiChange)/sa.cfg.OISpikePct, 2.0)
                        directionScore += dir * strength
                        confidence += 20 * strength
                        states["OI Spike"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.1f%%", oiChange)}
                        activeCount++
                } else {
                        states["OI Spike"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.1f%%", oiChange)}
                }
        }

        // --- 7) OB Imbalance ---
        if snap.BidDepth > 0 && snap.AskDepth > 0 {
                ratio := snap.BidDepth / snap.AskDepth
                if ratio > sa.cfg.OBImbalanceRatio || ratio < 1/sa.cfg.OBImbalanceRatio {
                        var dir float64
                        if ratio > sa.cfg.OBImbalanceRatio { dir = 1 } else { dir = -1 }
                        strength := math.Min(math.Abs(ratio-1)/2, 2.0)
                        directionScore += dir * strength
                        confidence += 15 * strength
                        states["OB Imbalance"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.1f", ratio)}
                        activeCount++
                } else {
                        states["OB Imbalance"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.1f", ratio)}
                }
        }

        // --- 8) OB Wall ---
        if snap.OBWallSize > sa.cfg.OBWallUSD {
                dir := 0.5
                if snap.OBWallSide == "ASK" { dir = -0.5 }
                strength := math.Min(snap.OBWallSize/sa.cfg.OBWallUSD, 2.0)
                directionScore += dir * strength
                confidence += 15 * strength
                states["OB Wall"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("$%.0f %s", snap.OBWallSize, snap.OBWallSide)}
                activeCount++
        } else if snap.OBWallSize > 0 {
                states["OB Wall"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("$%.0f", snap.OBWallSize)}
        }

        // --- 9) Whale Wallet Activity ---
        if sentiment != nil && len(sentiment.TraderProfiles) > 0 {
                netDir := 0.0
                if sentiment.WalletsLongCount > sentiment.WalletsShortCount { netDir = 1.5 }
                if sentiment.WalletsShortCount > sentiment.WalletsLongCount { netDir = -1.5 }
                if netDir != 0 {
                        directionScore += netDir
                        confidence += 25
                        states["Whale Wallets"] = SignalState{Active: true, Direction: dirStr(netDir), Value: fmt.Sprintf("L:%d S:%d", sentiment.WalletsLongCount, sentiment.WalletsShortCount)}
                        activeCount++
                } else {
                        states["Whale Wallets"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("L:%d S:%d", sentiment.WalletsLongCount, sentiment.WalletsShortCount)}
                }
        }

        // --- 10) Momentum Shift ---
        if sa.prevPrice > 0 {
                momentumPct := (snap.Price - sa.prevPrice) / sa.prevPrice * 100
                if math.Abs(momentumPct) > sa.cfg.MomentumShiftPct {
                        dir := math.Copysign(1, momentumPct)
                        strength := math.Min(math.Abs(momentumPct)/sa.cfg.MomentumShiftPct, 2.0)
                        directionScore += dir * strength
                        confidence += 10 * strength
                        states["Momentum"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.2f%%", momentumPct)}
                        activeCount++
                } else {
                        states["Momentum"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.2f%%", momentumPct)}
                }
        }

        // --- 11) Market Sentiment ---
        if sentiment != nil && sentiment.Score != 0 {
                dir := math.Copysign(1, sentiment.Score)
                strength := math.Min(math.Abs(sentiment.Score)/50, 2.0)
                directionScore += dir * strength
                confidence += sa.cfg.SentimentWeight * strength
                states["Sentiment"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%s (%.0f)", sentiment.Label, sentiment.Score)}
                activeCount++
        } else {
                states["Sentiment"] = SignalState{Active: false, Direction: "NEUTRAL", Value: "—"}
        }

        // --- 12) OFI (Order Flow Imbalance) ---
        if math.Abs(snap.OFINet) > sa.cfg.OFIStrongThresh {
                dir := math.Copysign(1, snap.OFINet)
                strength := math.Min(math.Abs(snap.OFINet)/sa.cfg.OFIExtremeThresh, 2.0)
                volMult := 1.0
                if snap.VolatilityPct > sa.cfg.VolatilityHighPct { volMult = 1.5 }
                directionScore += dir * strength
                confidence += 25 * strength * volMult
                states["OFI"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("$%.0f", snap.OFINet)}
                activeCount++
        } else if snap.OFINet != 0 {
                states["OFI"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("$%.0f", snap.OFINet)}
        }

        // --- 13) CVD Divergence ---
        if math.Abs(snap.CVDDivergence) > sa.cfg.CVDDivergencePct {
                // div > 0 (price up, CVD down) = bearish; div < 0 = bullish
                dir := -math.Copysign(1, snap.CVDDivergence)
                strength := math.Min(math.Abs(snap.CVDDivergence)/sa.cfg.CVDDivergencePct, 2.0)
                volMult := 1.0
                if snap.VolatilityPct > sa.cfg.VolatilityHighPct { volMult = 1.5 }
                directionScore += dir * strength
                confidence += 20 * strength * volMult
                states["CVD Div"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.2f", snap.CVDDivergence)}
                activeCount++
        } else {
                states["CVD Div"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.2f", snap.CVDDivergence)}
        }

        // --- 14) Perp Premium ---
        if math.Abs(snap.PerpPremiumPct) > sa.cfg.PerpPremiumThreshold {
                // Premium = bearish, Discount = bullish
                dir := -math.Copysign(1, snap.PerpPremiumPct)
                strength := math.Min(math.Abs(snap.PerpPremiumPct)/sa.cfg.PerpPremiumExtreme, 2.0)
                directionScore += dir * strength
                confidence += 15 * strength
                states["Perp Premium"] = SignalState{Active: true, Direction: dirStr(dir), Value: snap.PerpPremiumLabel}
                activeCount++
        } else {
                states["Perp Premium"] = SignalState{Active: false, Direction: "NEUTRAL", Value: snap.PerpPremiumLabel}
        }

        // --- 15) Mean Reversion ---
        if snap.MeanReversionSignal == "OVERBOUGHT" {
                directionScore -= 1.5
                confidence += 18
                states["Mean Revert"] = SignalState{Active: true, Direction: "DOWN", Value: "OVERBOUGHT"}
                activeCount++
        } else if snap.MeanReversionSignal == "OVERSOLD" {
                directionScore += 1.5
                confidence += 18
                states["Mean Revert"] = SignalState{Active: true, Direction: "UP", Value: "OVERSOLD"}
                activeCount++
        } else {
                states["Mean Revert"] = SignalState{Active: false, Direction: "NEUTRAL", Value: snap.MeanReversionSignal}
        }

        // --- 16) Funding Countdown ---
        if snap.FundingNear {
                var dir float64
                if snap.FundingRate > 0 { dir = -1 } else { dir = 1 }
                directionScore += dir
                confidence += 12
                states["Funding CD"] = SignalState{Active: true, Direction: dirStr(dir), Value: fmt.Sprintf("%.0f min", snap.FundingCountdownMin)}
                activeCount++
        } else {
                states["Funding CD"] = SignalState{Active: false, Direction: "NEUTRAL", Value: fmt.Sprintf("%.0f min", snap.FundingCountdownMin)}
        }

        // --- 17) Volatility Regime (info only) ---
        states["Volatility"] = SignalState{Active: snap.VolatilityRegime != "MEDIUM", Direction: "NEUTRAL", Value: fmt.Sprintf("%s %.2f%%", snap.VolatilityRegime, snap.VolatilityPct)}

        // --- Determine final signal ---
        finalDirection := "NEUTRAL"
        if directionScore > sa.cfg.DirectionScoreMargin { finalDirection = "UP" }
        if directionScore < -sa.cfg.DirectionScoreMargin { finalDirection = "DOWN" }

        finalConfidence := 0.0
        if activeCount > 0 {
                finalConfidence = math.Min(confidence/float64(activeCount)*2.5, 100)
        }

        // --- Signal flip protection ---
        if sa.prevSignal != nil && finalDirection != "NEUTRAL" && sa.prevSignal.Direction != "NEUTRAL" && finalDirection != sa.prevSignal.Direction {
                elapsed := time.Since(sa.lastSignalTime).Seconds()
                if elapsed < float64(sa.cfg.SignalFlipCooldownSec) {
                        finalDirection = "NEUTRAL"
                        finalConfidence = math.Min(finalConfidence, 40)
                        reasons = append(reasons, "flip blocked")
                }
        }

        signal := &Signal{
                Direction:  finalDirection,
                Confidence: math.Round(finalConfidence*10) / 10,
                Reasons:    reasons,
        }

        if finalDirection != "NEUTRAL" && (sa.prevSignal == nil || finalDirection != sa.prevSignal.Direction) {
                sa.lastSignalTime = time.Now()
        }
        sa.prevSignal = signal

        return signal, states
}

func dirStr(d float64) string {
        if d > 0 { return "UP" }
        if d < 0 { return "DOWN" }
        return "NEUTRAL"
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAPER TRADING ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

type PaperTrader struct {
        cfg              *Config
        Balance          float64
        RealizedPnL      float64
        DailyPnL         float64
        DailyStartBalance float64
        Positions        []PaperPosition
        Trades           []PaperTrade
        Wins             int
        Losses           int
        TotalFees        float64
        MaxBalance       float64
        LastTradeTime    time.Time
        mu               sync.Mutex
}

func NewPaperTrader(cfg *Config) *PaperTrader {
        return &PaperTrader{
                cfg:              cfg,
                Balance:          1000.0,
                DailyStartBalance: 1000.0,
                MaxBalance:       1000.0,
        }
}

func (pt *PaperTrader) ProcessSignal(signal *Signal, price float64) {
        pt.mu.Lock()
        defer pt.mu.Unlock()

        if signal.Direction == "NEUTRAL" || signal.Confidence < float64(pt.cfg.MinConfidence) {
                return
        }

        // Check cooldown
        if time.Since(pt.LastTradeTime).Seconds() < float64(pt.cfg.CooldownAfterTradeSec) {
                return
        }

        // If we have an open position
        if len(pt.Positions) > 0 {
                // Convert signal direction to position side (UP→LONG, DOWN→SHORT)
                signalSide := signal.Direction
                if signalSide == "UP" { signalSide = "LONG" }
                if signalSide == "DOWN" { signalSide = "SHORT" }

                // Check ALL positions for same-direction skip
                sameDir := false
                for _, pos := range pt.Positions {
                        if pos.Side == signalSide { sameDir = true; break }
                }
                if sameDir { return }

                pos := &pt.Positions[0]
                // Opposite direction — check exit protection
                if pt.cfg.ExitOnlyOnSLTP {
                        // Only exit on SL/TP, ignore signal reversal
                        logMsg("INFO", "⏳ Paper %s %s: signal reversal (%s) blocked — exit_only_on_sltp=true", pos.Side, pos.Coin, signalSide)
                        return
                }
                holdMin := time.Since(pos.OpenedAt).Minutes()
                if pt.cfg.MinHoldMinutes > 0 && holdMin < pt.cfg.MinHoldMinutes {
                        // Too early to exit via signal reversal
                        logMsg("INFO", "⏳ Paper %s %s: signal reversal (%s) blocked — hold %.1f/%.1f min", pos.Side, pos.Coin, signal.Direction, holdMin, pt.cfg.MinHoldMinutes)
                        return
                }
                // Opposite direction — close first
                pt.closePosition(pos, price, "signal reversal")
                // Remove only the closed position, preserve any remaining positions
                var remaining []PaperPosition
                for i := range pt.Positions {
                        if i != 0 { remaining = append(remaining, pt.Positions[i]) }
                }
                pt.Positions = remaining
        }

        // Open new position
        side := signal.Direction // UP = LONG, DOWN = SHORT
        if side != "LONG" && side != "SHORT" {
                if side == "UP" { side = "LONG" } else { side = "SHORT" }
        }

        positionPct := math.Min(0.05*(signal.Confidence/100)*2, 0.30)
        sizeUSD := pt.Balance * positionPct * float64(pt.cfg.Leverage)
        if sizeUSD < 1 { return } // Too small
        if sizeUSD > pt.cfg.OrderSizeUSD*float64(pt.cfg.Leverage) {
                sizeUSD = pt.cfg.OrderSizeUSD * float64(pt.cfg.Leverage)
        }

        fee := sizeUSD * 0.00035 // maker fee
        pt.TotalFees += fee
        pt.Balance -= fee // deduct opening fee from balance

        var sl, tp float64
        if side == "LONG" {
                sl = price * (1 - pt.cfg.StopLossPct/100)
                tp = price * (1 + pt.cfg.TakeProfitPct/100)
        } else {
                sl = price * (1 + pt.cfg.StopLossPct/100)
                tp = price * (1 - pt.cfg.TakeProfitPct/100)
        }

        pt.Positions = append(pt.Positions, PaperPosition{
                Coin: pt.cfg.Coin, Side: side, EntryPrice: price,
                SizeUSD: sizeUSD, StopLoss: sl, TakeProfit: tp,
                Leverage: pt.cfg.Leverage, PeakPrice: price,
                OpenedAt: time.Now(),
        })

        pt.LastTradeTime = time.Now()
        logMsg("INFO", "📝 Paper %s %s $%.2f @ $%.2f SL:$%.2f TP:$%.2f", side, pt.cfg.Coin, sizeUSD, price, sl, tp)
}

// OpenDCAPosition opens a position with a specific size (used for DCA entries).
// Does NOT close existing positions — adds to them.
func (pt *PaperTrader) OpenDCAPosition(side string, price float64, sizeUSD float64) {
        pt.mu.Lock()
        defer pt.mu.Unlock()

        // Sanitize inputs — NaN price would create a position with NaN EntryPrice,
        // which would then produce NaN PnL on close and break json.Marshal.
        if math.IsNaN(price) || math.IsInf(price, 0) || price <= 0 {
                logMsg("WARN", "⚠️ OpenDCAPosition: price=%.4f invalid — skipping position open", price)
                return
        }
        if math.IsNaN(sizeUSD) || math.IsInf(sizeUSD, 0) || sizeUSD < 1 {
                return // Too small or invalid
        }

        fee := sizeUSD * 0.00035 // maker fee
        pt.TotalFees += fee
        pt.Balance -= fee

        var sl, tp float64
        if side == "LONG" {
                sl = price * (1 - pt.cfg.StopLossPct/100)
                tp = price * (1 + pt.cfg.TakeProfitPct/100)
        } else {
                sl = price * (1 + pt.cfg.StopLossPct/100)
                tp = price * (1 - pt.cfg.TakeProfitPct/100)
        }

        // Determine DCA entry level based on existing same-side positions
        dcaEntry := 1
        for _, pos := range pt.Positions {
                if pos.Side == side && pos.DCAEntry > 0 {
                        dcaEntry++
                }
        }
        dcaMult := 1.0
        if dcaEntry == 2 { dcaMult = 2.0 }
        if dcaEntry == 3 { dcaMult = 4.0 }

        pt.Positions = append(pt.Positions, PaperPosition{
                Coin: pt.cfg.Coin, Side: side, EntryPrice: price,
                SizeUSD: sizeUSD, StopLoss: sl, TakeProfit: tp,
                Leverage: pt.cfg.Leverage, PeakPrice: price,
                DCAEntry: dcaEntry, DCAMult: dcaMult,
                OpenedAt: time.Now(),
        })

        pt.LastTradeTime = time.Now()
        logMsg("INFO", "📝 DCA Paper %s %s $%.2f @ $%.2f SL:$%.2f TP:$%.2f [E%d %.0fx]", side, pt.cfg.Coin, sizeUSD, price, sl, tp, dcaEntry, dcaMult)
}

// CloseAllBySide closes ALL open positions of the given side (e.g., all LONGs) at the given price.
// Returns the number of positions closed.
func (pt *PaperTrader) CloseAllBySide(side string, exitPrice float64, reason string) int {
        pt.mu.Lock()
        defer pt.mu.Unlock()

        var remaining []PaperPosition
        closed := 0
        for i := range pt.Positions {
                pos := &pt.Positions[i]
                if pos.Side == side {
                        pt.closePosition(pos, exitPrice, reason)
                        closed++
                } else {
                        remaining = append(remaining, *pos)
                }
        }
        pt.Positions = remaining
        return closed
}

func (pt *PaperTrader) CheckSLTP(price float64) {
        pt.mu.Lock()
        defer pt.mu.Unlock()

        // Sanitize incoming price — if a NaN snapshot leaks through, every
        // downstream division/comparison would produce NaN, contaminating
        // pos.UnrealizedPnL and eventually breaking json.Marshal.
        if math.IsNaN(price) || math.IsInf(price, 0) {
                logMsg("WARN", "⚠️ CheckSLTP: price is NaN/Inf — skipping SL/TP check this iteration")
                return
        }

        var remaining []PaperPosition
        for i := range pt.Positions {
                pos := &pt.Positions[i]
                closed := false

                // Guard against NaN/zero EntryPrice — the `<= 0` check alone does NOT
                // catch NaN because NaN comparisons return false in Go.
                entryInvalid := math.IsNaN(pos.EntryPrice) || math.IsInf(pos.EntryPrice, 0) || pos.EntryPrice <= 0
                if entryInvalid {
                        logMsg("WARN", "⚠️ CheckSLTP: pos.EntryPrice=%.4f invalid — closing position to prevent NaN spread", pos.EntryPrice)
                        pt.closePosition(pos, price, "invalid entry price cleanup")
                        closed = true
                        continue
                }

                // Update peak price for trailing
                if pos.Side == "LONG" && price > pos.PeakPrice { pos.PeakPrice = price }
                if pos.Side == "SHORT" && price < pos.PeakPrice { pos.PeakPrice = price }

                // Trailing TP
                if pos.Side == "LONG" {
                        profitPct := (price - pos.EntryPrice) / pos.EntryPrice * 100
                        if profitPct >= pt.cfg.TrailingTPActivationPct {
                                pos.TrailingActive = true
                        }
                        if pos.TrailingActive {
                                trailTP := pos.PeakPrice * (1 - pt.cfg.TrailingTPDistancePct/100)
                                if trailTP > pos.TakeProfit+pos.EntryPrice*pt.cfg.TrailingTPStepPct/100 {
                                        pos.TakeProfit = trailTP
                                }
                        }
                } else if pos.Side == "SHORT" {
                        profitPct := (pos.EntryPrice - price) / pos.EntryPrice * 100
                        if profitPct >= pt.cfg.TrailingTPActivationPct {
                                pos.TrailingActive = true
                        }
                        if pos.TrailingActive {
                                trailTP := pos.PeakPrice * (1 + pt.cfg.TrailingTPDistancePct/100)
                                if trailTP < pos.TakeProfit-pos.EntryPrice*pt.cfg.TrailingTPStepPct/100 {
                                        pos.TakeProfit = trailTP
                                }
                        }
                }

                // Check SL/TP
                if pos.Side == "LONG" {
                        if price <= pos.StopLoss { pt.closePosition(pos, pos.StopLoss, "stop loss"); closed = true }
                        if price >= pos.TakeProfit { pt.closePosition(pos, pos.TakeProfit, "take profit"); closed = true }
                } else {
                        if price >= pos.StopLoss { pt.closePosition(pos, pos.StopLoss, "stop loss"); closed = true }
                        if price <= pos.TakeProfit { pt.closePosition(pos, pos.TakeProfit, "take profit"); closed = true }
                }

                if !closed {
                        // Update unrealized PnL (EntryPrice is guaranteed valid by the guard above)
                        if pos.Side == "LONG" {
                                pos.UnrealizedPnL = (price - pos.EntryPrice) / pos.EntryPrice * pos.SizeUSD
                        } else {
                                pos.UnrealizedPnL = (pos.EntryPrice - price) / pos.EntryPrice * pos.SizeUSD
                        }
                        // Defensive: if SizeUSD was NaN from prior corruption, clamp.
                        if math.IsNaN(pos.UnrealizedPnL) || math.IsInf(pos.UnrealizedPnL, 0) {
                                pos.UnrealizedPnL = 0
                        }
                        remaining = append(remaining, *pos)
                }
        }
        pt.Positions = remaining
}

func (pt *PaperTrader) closePosition(pos *PaperPosition, exitPrice float64, reason string) {
        var pnl float64
        // Sanitize exitPrice — if a NaN snapshot leaks through, the PnL
        // computation would produce NaN, which would then be stored in
        // PaperTrade.PnL and break json.Marshal on the next GetStatus emit.
        if math.IsNaN(exitPrice) || math.IsInf(exitPrice, 0) {
                logMsg("WARN", "⚠️ closePosition: exitPrice is NaN/Inf — using EntryPrice as fallback")
                exitPrice = pos.EntryPrice
        }
        // Guard against NaN EntryPrice too — the original `<= 0` check does NOT
        // catch NaN because NaN comparisons return false in Go.
        if math.IsNaN(pos.EntryPrice) || math.IsInf(pos.EntryPrice, 0) || pos.EntryPrice <= 0 {
                // Defensive guard: a position should never have EntryPrice == 0 or NaN,
                // but if it does (race / corrupted state), avoid NaN propagation
                // by treating PnL as the size difference at zero cost basis.
                logMsg("WARN", "⚠️ closePosition: pos.EntryPrice=%.4f (zero/NaN/invalid) — skipping PnL to avoid NaN", pos.EntryPrice)
                pnl = -pos.SizeUSD * 0.00035 // only fee impact
        } else if pos.Side == "LONG" {
                pnl = (exitPrice - pos.EntryPrice) / pos.EntryPrice * pos.SizeUSD
        } else {
                pnl = (pos.EntryPrice - exitPrice) / pos.EntryPrice * pos.SizeUSD
        }
        closeFee := pos.SizeUSD * 0.00035
        pnl -= closeFee
        // Final defensive sanitization — if pnl somehow ended up NaN/Inf despite
        // the guards above (e.g. SizeUSD was NaN), clamp to 0 before storing.
        if math.IsNaN(pnl) || math.IsInf(pnl, 0) {
                logMsg("WARN", "⚠️ closePosition: pnl is NaN/Inf after computation — clamping to 0")
                pnl = 0
        }
        pt.TotalFees += closeFee

        pt.RealizedPnL += pnl
        pt.Balance += pnl

        if pnl >= 0 { pt.Wins++ } else { pt.Losses++ }

        holdMin := time.Since(pos.OpenedAt).Minutes()

        pt.Trades = append(pt.Trades, PaperTrade{
                Coin: pos.Coin, Side: pos.Side,
                EntryPx: pos.EntryPrice, ExitPx: exitPrice,
                SizeUSD: pos.SizeUSD, PnL: pnl, Fee: closeFee,
                Time: time.Now().Format("15:04:05"),
        })
        // Cap trade history to prevent unbounded memory growth
        if len(pt.Trades) > 500 {
                pt.Trades = pt.Trades[len(pt.Trades)-500:]
        }

        logMsg("INFO", "💰 Paper closed %s %s PnL: $%+.2f (%s, held %.1f min)", pos.Side, pos.Coin, pnl, reason, holdMin)
}

func (pt *PaperTrader) GetStatus(price float64) map[string]interface{} {
        pt.mu.Lock()
        defer pt.mu.Unlock()

        // Sanitize incoming price — if NaN, equity computation would produce NaN
        if math.IsNaN(price) || math.IsInf(price, 0) {
                price = 0
        }

        // Update balance with unrealized PnL
        equity := pt.Balance
        // Sanitize Balance itself (defensive — could be NaN from prior corruption)
        if math.IsNaN(equity) || math.IsInf(equity, 0) {
                equity = 0
                pt.Balance = 0
        }
        for _, pos := range pt.Positions {
                // Guard against NaN/Inf/zero EntryPrice — `<= 0` alone does NOT catch NaN
                if math.IsNaN(pos.EntryPrice) || math.IsInf(pos.EntryPrice, 0) || pos.EntryPrice <= 0 {
                        continue
                }
                if pos.Side == "LONG" {
                        equity += (price - pos.EntryPrice) / pos.EntryPrice * pos.SizeUSD
                } else {
                        equity += (pos.EntryPrice - price) / pos.EntryPrice * pos.SizeUSD
                }
        }

        // Sanitize equity (defensive — if SizeUSD was NaN from prior corruption)
        if math.IsNaN(equity) || math.IsInf(equity, 0) {
                equity = 0
        }

        // Sanitize DailyStartBalance — `!= 0` alone does NOT catch NaN
        dailyStart := pt.DailyStartBalance
        if math.IsNaN(dailyStart) || math.IsInf(dailyStart, 0) {
                dailyStart = 0
        }

        roi := 0.0
        if dailyStart != 0 {
                roi = (equity - dailyStart) / dailyStart * 100
        }
        winRate := 0.0
        if pt.Wins+pt.Losses > 0 { winRate = float64(pt.Wins) / float64(pt.Wins+pt.Losses) * 100 }
        dailyPnL := equity - dailyStart
        // Defensive: if dailyPnL somehow ended up NaN, clamp to 0
        if math.IsNaN(dailyPnL) || math.IsInf(dailyPnL, 0) {
                dailyPnL = 0
        }

        // Max drawdown
        if equity > pt.MaxBalance { pt.MaxBalance = equity }
        // Sanitize MaxBalance — `> 0` alone does NOT catch NaN
        maxBalance := pt.MaxBalance
        if math.IsNaN(maxBalance) || math.IsInf(maxBalance, 0) {
                maxBalance = 0
                pt.MaxBalance = 0
        }
        drawdownPct := 0.0
        if maxBalance > 0 { drawdownPct = (maxBalance - equity) / maxBalance * 100 }

        // Build open positions for JSON
        openPositions := make([]map[string]interface{}, 0)
        for _, pos := range pt.Positions {
                // Sanitize each field defensively — pos.UnrealizedPnL could be NaN
                // if a prior CheckSLTP call raced with a NaN snapshot
                unrealizedPnl := pos.UnrealizedPnL
                if math.IsNaN(unrealizedPnl) || math.IsInf(unrealizedPnl, 0) {
                        unrealizedPnl = 0
                }
                entryPrice := pos.EntryPrice
                if math.IsNaN(entryPrice) || math.IsInf(entryPrice, 0) { entryPrice = 0 }
                sizeUsd := pos.SizeUSD
                if math.IsNaN(sizeUsd) || math.IsInf(sizeUsd, 0) { sizeUsd = 0 }
                stopLoss := pos.StopLoss
                if math.IsNaN(stopLoss) || math.IsInf(stopLoss, 0) { stopLoss = 0 }
                takeProfit := pos.TakeProfit
                if math.IsNaN(takeProfit) || math.IsInf(takeProfit, 0) { takeProfit = 0 }
                dcaMult := pos.DCAMult
                if math.IsNaN(dcaMult) || math.IsInf(dcaMult, 0) { dcaMult = 0 }

                posMap := map[string]interface{}{
                        "coin": pos.Coin, "side": pos.Side,
                        "entryPrice": entryPrice, "sizeUsd": sizeUsd,
                        "unrealizedPnl": unrealizedPnl,
                        "stopLoss": stopLoss, "takeProfit": takeProfit,
                        "leverage": pos.Leverage,
                }
                if pos.DCAEntry > 0 {
                        posMap["dcaEntry"] = pos.DCAEntry
                        posMap["dcaMult"] = dcaMult
                }
                openPositions = append(openPositions, posMap)
        }

        // Recent trades (last 20)
        recentTrades := make([]PaperTrade, 0)
        start := 0
        if len(pt.Trades) > 20 { start = len(pt.Trades) - 20 }
        recentTrades = append(recentTrades, pt.Trades[start:]...)

        return map[string]interface{}{
                "balance":         math.Round(equity*100) / 100,
                "cashBalance":     math.Round(pt.Balance*100) / 100,
                "realizedPnl":     math.Round(pt.RealizedPnL*100) / 100,
                "unrealizedPnl":   math.Round((equity-pt.Balance)*100) / 100,
                "dailyPnl":        math.Round(dailyPnL*100) / 100,
                "roi":             math.Round(roi*100) / 100,
                "winRate":         math.Round(winRate*10) / 10,
                "totalTrades":     pt.Wins + pt.Losses,
                "wins":            pt.Wins,
                "losses":          pt.Losses,
                "fees":            math.Round(pt.TotalFees*100) / 100,
                "positions":       len(pt.Positions),
                "maxDrawdownPct":  math.Round(drawdownPct*100) / 100,
                "leverage":        pt.cfg.Leverage,
                "openPositions":   openPositions,
                "recentTrades":    recentTrades,
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED SENTIMENT (Fear & Greed + CryptoPanic)
// ═══════════════════════════════════════════════════════════════════════════════

type EnhancedSentimentEngine struct {
        cfg         *Config
        cached      *EnhancedSentiment
        lastRefresh time.Time
}

func NewEnhancedSentimentEngine(cfg *Config) *EnhancedSentimentEngine {
        return &EnhancedSentimentEngine{cfg: cfg}
}

func (e *EnhancedSentimentEngine) Fetch() *EnhancedSentiment {
        if e.cached != nil && time.Since(e.lastRefresh).Seconds() < float64(e.cfg.SentimentRefreshSec) {
                return e.cached
        }

        es := &EnhancedSentiment{Sources: []string{}}

        // Fear & Greed
        fgVal, fgLabel := e.fetchFearGreed()
        es.FearGreedIndex = fgVal
        es.FearGreedLabel = fgLabel
        if fgVal >= 0 { es.Sources = append(es.Sources, "alternative.me") }

        // CryptoPanic
        bullCount, bearCount, newsSent := e.fetchCryptoPanic()
        es.NewsBullishCount = bullCount
        es.NewsBearishCount = bearCount
        es.NewsSentiment = newsSent
        if bullCount+bearCount > 0 { es.Sources = append(es.Sources, "cryptopanic") }

        // Combined score
        var fgNorm float64 // -1 to +1
        if fgVal >= 0 { fgNorm = (float64(fgVal) - 50) / 50 }
        es.CombinedScore = fgNorm*0.6 + newsSent*0.4

        e.cached = es
        e.lastRefresh = time.Now()
        return es
}

func (e *EnhancedSentimentEngine) fetchFearGreed() (int, string) {
        url := fmt.Sprintf("%s?limit=1", e.cfg.FearGreedAPI)
        result, err := httpGetJSON(url)
        if err != nil { return -1, "" }
        data, ok := result["data"].([]interface{})
        if !ok || len(data) == 0 { return -1, "" }
        entry, ok := data[0].(map[string]interface{})
        if !ok { return -1, "" }
        val := -1
        if v, ok := entry["value"].(string); ok { val, _ = strconv.Atoi(v) }
        label, _ := entry["value_classification"].(string)
        return val, label
}

func (e *EnhancedSentimentEngine) fetchCryptoPanic() (bull, bear int, sentiment float64) {
        if e.cfg.CryptopanicKey == "" { return 0, 0, 0 }
        url := fmt.Sprintf("%s?auth_token=%s&currencies=%s&filter=hot&public=true", e.cfg.CryptopanicAPI, e.cfg.CryptopanicKey, e.cfg.Coin)
        result, err := httpGetJSON(url)
        if err != nil { return 0, 0, 0 }
        results, ok := result["results"].([]interface{})
        if !ok { return 0, 0, 0 }

        bullishWords := []string{"bullish", "rally", "surge", "breakout", "pump", "moon", "buy", "long", "gain", "rise", "soar", "bull"}
        bearishWords := []string{"bearish", "crash", "dump", "sell", "short", "drop", "fall", "decline", "plunge", "bear", "fear", "panic"}

        for _, r := range results {
                if entry, ok := r.(map[string]interface{}); ok {
                        title, _ := entry["title"].(string)
                        titleLower := strings.ToLower(title)
                        for _, w := range bullishWords {
                                if strings.Contains(titleLower, w) { bull++; break }
                        }
                        for _, w := range bearishWords {
                                if strings.Contains(titleLower, w) { bear++; break }
                        }
                }
        }

        total := bull + bear
        if total > 0 { sentiment = float64(bull-bear) / float64(total) }
        return bull, bear, sentiment
}

// ═══════════════════════════════════════════════════════════════════════════════
// CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════════

type CircuitBreaker struct {
        cfg              *Config
        active           bool
        reason           string
        triggeredAt      time.Time
        dailyStartBalance float64
        consecutiveLosses int
}

func NewCircuitBreaker(cfg *Config) *CircuitBreaker {
        return &CircuitBreaker{cfg: cfg, dailyStartBalance: 1000}
}

func (cb *CircuitBreaker) Check(paperBalance float64, recentTrades []PaperTrade) *CircuitBreakerState {
        // Sanitize paperBalance — if PaperTrader ever produces NaN (e.g. corrupted
        // state from a prior bug), CB should not propagate it further.
        if math.IsNaN(paperBalance) || math.IsInf(paperBalance, 0) {
                paperBalance = 0
        }

        if !cb.cfg.CBEnabled {
                return &CircuitBreakerState{Active: false, Thresholds: map[string]float64{
                        "maxDailyLossPct": cb.cfg.CBMaxDailyLossPct,
                        "maxConsecutiveLosses": float64(cb.cfg.CBMaxConsecutiveLosses),
                        "maxDrawdownPct": cb.cfg.CBMaxDrawdownPct,
                }}
        }

        // Daily loss check
        dailyLossPct := 0.0
        if cb.dailyStartBalance > 0 {
                dailyLossPct = (cb.dailyStartBalance - paperBalance) / cb.dailyStartBalance * 100
        }

        // Consecutive losses
        consecutiveLosses := 0
        for i := len(recentTrades) - 1; i >= 0; i-- {
                if recentTrades[i].PnL < 0 { consecutiveLosses++ } else { break }
        }
        cb.consecutiveLosses = consecutiveLosses

        // Drawdown
        maxBalance := math.Max(cb.dailyStartBalance, paperBalance)
        drawdownPct := 0.0
        if maxBalance > 0 { drawdownPct = (maxBalance - paperBalance) / maxBalance * 100 }

        // Check triggers
        triggered := false
        reason := ""

        if dailyLossPct > cb.cfg.CBMaxDailyLossPct {
                triggered = true
                reason = fmt.Sprintf("Daily loss %.1f%% > %.1f%%", dailyLossPct, cb.cfg.CBMaxDailyLossPct)
        }
        if consecutiveLosses >= cb.cfg.CBMaxConsecutiveLosses {
                triggered = true
                reason = fmt.Sprintf("Consecutive losses %d >= %d", consecutiveLosses, cb.cfg.CBMaxConsecutiveLosses)
        }
        if drawdownPct > cb.cfg.CBMaxDrawdownPct {
                triggered = true
                reason = fmt.Sprintf("Drawdown %.1f%% > %.1f%%", drawdownPct, cb.cfg.CBMaxDrawdownPct)
        }

        if triggered && !cb.active {
                cb.active = true
                cb.reason = reason
                cb.triggeredAt = time.Now()
                logMsg("WARN", "🛑 Circuit Breaker AKTYWNY: %s", reason)
        }

        // Check cooldown
        cooldownRemaining := 0.0
        if cb.active {
                elapsed := time.Since(cb.triggeredAt).Minutes()
                cooldownRemaining = float64(cb.cfg.CBCooldownMinutes) - elapsed
                if cooldownRemaining <= 0 {
                        cb.active = false
                        cb.reason = ""
                        cb.dailyStartBalance = paperBalance
                        logMsg("INFO", "✅ Circuit Breaker zresetowany")
                }
        }

        return &CircuitBreakerState{
                Active: cb.active,
                Reason: cb.reason,
                TriggeredAt: cb.triggeredAt.Format(time.RFC3339),
                DailyLossPct: math.Round(dailyLossPct*100)/100,
                ConsecutiveLosses: cb.consecutiveLosses,
                DrawdownPct: math.Round(drawdownPct*100)/100,
                CooldownRemainingMin: math.Round(cooldownRemaining*10)/10,
                Thresholds: map[string]float64{
                        "maxDailyLossPct": cb.cfg.CBMaxDailyLossPct,
                        "maxConsecutiveLosses": float64(cb.cfg.CBMaxConsecutiveLosses),
                        "maxDrawdownPct": cb.cfg.CBMaxDrawdownPct,
                },
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ON-CHAIN ANALYTICS (v0.1)
// ═══════════════════════════════════════════════════════════════════════════════

type OnChainAnalyzer struct {
        cfg          *Config
        lastFetch    time.Time
        cached       *OnChainMetrics
}

func NewOnChainAnalyzer(cfg *Config) *OnChainAnalyzer {
        return &OnChainAnalyzer{cfg: cfg}
}

func (o *OnChainAnalyzer) Fetch() *OnChainMetrics {
        // Rate limit: refresh every OnchainRefreshSec (default 300s)
        if o.cached != nil && time.Since(o.lastFetch) < time.Duration(o.cfg.OnchainRefreshSec)*time.Second {
                return o.cached
        }

        result := &OnChainMetrics{
                WhaleHodlingTrend:   "NEUTRAL",
                OverallSignal:       "NEUTRAL",
                NUPL:                0.5,
                OISignal:            "NEUTRAL",
                FundingSignal:       "NEUTRAL",
                LiquidationSignal:   "NEUTRAL",
                DataSource:          "HYPERLIQUID",
        }

        // ═══ 1) Hyperliquid On-Chain Data (primary source) ═══
        func() {
                defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (OnChain): %v", r) } }()

                // Fetch clearinghouse state for OI, funding, premium
                // Note: metaAndAssetCtxs returns an ARRAY [universe, assetCtxs], not an object
                coin := o.cfg.Coin
                body, _ := json.Marshal(map[string]interface{}{"type": "metaAndAssetCtxs"})
                resp, err := httpClient.Post(o.cfg.HLMainnetAPI+"/info", "application/json", strings.NewReader(string(body)))
                if err != nil {
                        logMsg("WARN", "OnChain: HL metaAndAssetCtxs HTTP error: %v", err)
                        return
                }
                defer resp.Body.Close()
                data, _ := io.ReadAll(resp.Body)

                // Response is [universe, assetCtxs]
                var raw []json.RawMessage
                if err := json.Unmarshal(data, &raw); err != nil {
                        logMsg("WARN", "OnChain: HL metaAndAssetCtxs parse error: %v", err)
                        return
                }
                if len(raw) < 2 {
                        logMsg("WARN", "OnChain: HL metaAndAssetCtxs unexpected format (len=%d)", len(raw))
                        return
                }

                // Parse universe to find coin index
                // raw[0] is a dict: {"universe": [...], "marginTables": [...], ...}
                var metaObj map[string]interface{}
                json.Unmarshal(raw[0], &metaObj)
                var universe []interface{}
                if u, ok := metaObj["universe"].([]interface{}); ok {
                        universe = u
                }
                coinIdx := -1
                for i, u := range universe {
                        if m, ok := u.(map[string]interface{}); ok {
                                if name, ok := m["name"].(string); ok && name == coin {
                                        coinIdx = i
                                        break
                                }
                        }
                }
                if coinIdx < 0 {
                        logMsg("WARN", "OnChain: coin %s not found in HL universe", coin)
                        return
                }

                // Parse asset contexts
                var assetCtxs []interface{}
                json.Unmarshal(raw[1], &assetCtxs)
                if coinIdx >= len(assetCtxs) {
                        logMsg("WARN", "OnChain: coinIdx %d out of range (len=%d)", coinIdx, len(assetCtxs))
                        return
                }
                if ac, ok := assetCtxs[coinIdx].(map[string]interface{}); ok {
                        if v, ok := ac["openInterest"].(string); ok {
                                result.HLOpenInterestUSD, _ = strconv.ParseFloat(v, 64)
                        }
                        if v, ok := ac["funding"].(string); ok {
                                result.HLFundingRate, _ = strconv.ParseFloat(v, 64)
                        }
                        if v, ok := ac["premium"].(string); ok {
                                result.HLPremiumIndex, _ = strconv.ParseFloat(v, 64)
                        }
                        if v, ok := ac["dayNtlVlm"].(string); ok {
                                dayVol, _ := strconv.ParseFloat(v, 64)
                                result.TransactionVolumeUSD = dayVol
                        }
                        if v, ok := ac["markPx"].(string); ok {
                                markPx, _ := strconv.ParseFloat(v, 64)
                                _ = markPx // available for reference
                        }
                        if v, ok := ac["prevDayPx"].(string); ok {
                                prevPx, _ := strconv.ParseFloat(v, 64)
                                _ = prevPx // available for 24h change
                        }
                }

                logMsg("INFO", "OnChain: HL data fetched — OI=$%.0f FR=%.6f Premium=%.4f",
                        result.HLOpenInterestUSD, result.HLFundingRate, result.HLPremiumIndex)
        }()

        // ═══ 2) Fetch OI change from HL funding history ═══
        func() {
                defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (OI/Funding): %v", r) } }()
                // Get recent funding rates to compute OI trend
                // Note: fundingHistory returns an array directly, requires startTime
                coin := o.cfg.Coin
                startTime := time.Now().Add(-24 * time.Hour).UnixMilli()
                body, _ := json.Marshal(map[string]interface{}{
                        "type":      "fundingHistory",
                        "coin":      coin,
                        "startTime": startTime,
                })
                resp, err := httpClient.Post(o.cfg.HLMainnetAPI+"/info", "application/json", strings.NewReader(string(body)))
                if err != nil {
                        return
                }
                defer resp.Body.Close()
                data, _ := io.ReadAll(resp.Body)

                // Response is an array of funding rate entries
                var hist []map[string]interface{}
                if err := json.Unmarshal(data, &hist); err != nil {
                        return
                }
                if len(hist) >= 2 {
                        // Compare recent vs older funding rates
                        // Rising funding = bullish sentiment (but potential top)
                        // Falling/negative funding = bearish sentiment (but potential bottom)
                        recentRate := 0.0
                        if v, ok := hist[0]["fundingRate"].(string); ok {
                                recentRate, _ = strconv.ParseFloat(v, 64)
                        }
                        olderRate := 0.0
                        if v, ok := hist[len(hist)-1]["fundingRate"].(string); ok {
                                olderRate, _ = strconv.ParseFloat(v, 64)
                        }
                        // Estimate OI change from funding trend
                        if olderRate != 0 {
                                result.HLOIChangePct = (recentRate - olderRate) / math.Abs(olderRate) * 100
                        }
                }
        }()

        // ═══ 3) Compute derived signals from Hyperliquid data ═══

        // OI Signal
        if result.HLOpenInterestUSD > 0 {
                // High OI + rising = trend continuation
                // High OI + falling = potential squeeze
                if result.HLOIChangePct > 5 {
                        result.OISignal = "RISING_OI"
                } else if result.HLOIChangePct < -5 {
                        result.OISignal = "FALLING_OI"
                }
        }

        // Funding Signal
        if result.HLFundingRate != 0 {
                frAnnualized := result.HLFundingRate * 3 * 365 // 8h periods * 365 days
                if frAnnualized > 50 {
                        result.FundingSignal = "EXTREME_LONG"  // Longs paying too much — contrarian bearish
                } else if frAnnualized > 20 {
                        result.FundingSignal = "HIGH_LONG"     // Longs dominant
                } else if frAnnualized < -50 {
                        result.FundingSignal = "EXTREME_SHORT" // Shorts paying too much — contrarian bullish
                } else if frAnnualized < -20 {
                        result.FundingSignal = "HIGH_SHORT"    // Shorts dominant
                }
        }

        // Liquidation signal (from premium + volatility)
        if math.Abs(result.HLPremiumIndex) > 0.15 {
                result.LiquidationSignal = "LIQUIDATION_RISK"
        }

        // ═══ 4) Fear & Greed index (free, reliable) ═══
        func() {
                defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (FearGreed): %v", r) } }()
                resp, err := httpClient.Get("https://api.alternative.me/fng/?limit=1")
                if err != nil {
                        return
                }
                defer resp.Body.Close()
                data, err := io.ReadAll(resp.Body)
                if err != nil {
                        return
                }
                var fng map[string]interface{}
                if json.Unmarshal(data, &fng) != nil {
                        return
                }
                if d, ok := fng["data"].([]interface{}); ok && len(d) > 0 {
                        if entry, ok := d[0].(map[string]interface{}); ok {
                                if v, ok := entry["value"].(string); ok {
                                        fgi, _ := strconv.Atoi(v)
                                        // Map Fear & Greed to MVRV-like z-score
                                        // FGI 0-25 (extreme fear) → MVRV z < -1
                                        // FGI 25-45 → MVRV z ~ 0
                                        // FGI 45-55 → MVRV z ~ 1
                                        // FGI 55-75 → MVRV z ~ 3
                                        // FGI 75-100 (extreme greed) → MVRV z > 7
                                        result.MVRVZScore = (float64(fgi) - 50) / 10.0
                                        // NUPL approximation from FGI
                                        result.NUPL = float64(fgi) / 100.0 * 0.75
                                        if fgi <= 25 {
                                                result.OverallSignal = "BULLISH" // Extreme fear = potential bottom
                                        } else if fgi >= 75 {
                                                result.OverallSignal = "BEARISH" // Extreme greed = potential top
                                        }
                                }
                        }
                }
        }()

        // ═══ 5) Whale trend from exchange flow (use OI + funding as proxy) ═══
        // If funding is very positive and OI is rising → whales are distributing
        // If funding is negative and OI is falling → whales are accumulating
        frAnnualized := result.HLFundingRate * 3 * 365
        if result.HLOpenInterestUSD > 0 {
                if frAnnualized > 30 && result.OISignal == "RISING_OI" {
                        result.WhaleHodlingTrend = "DISTRIBUTING"
                } else if frAnnualized < -10 || result.OISignal == "FALLING_OI" {
                        result.WhaleHodlingTrend = "ACCUMULATING"
                }
        }

        // ═══ 6) Compute overall signal ═══
        signalScore := 0
        if result.MVRVZScore > 7 {
                signalScore -= 2
        } else if result.MVRVZScore < -1 {
                signalScore += 2
        }
        if result.NUPL > 0.75 {
                signalScore -= 2
        } else if result.NUPL < 0 {
                signalScore += 2
        }
        if result.ExchangeNetFlow < 0 {
                signalScore += 1
        } else if result.ExchangeNetFlow > 0 {
                signalScore -= 1
        }
        if result.WhaleHodlingTrend == "ACCUMULATING" {
                signalScore += 1
        } else if result.WhaleHodlingTrend == "DISTRIBUTING" {
                signalScore -= 1
        }
        // Hyperliquid signals
        if result.FundingSignal == "EXTREME_SHORT" {
                signalScore += 2 // Contrarian bullish
        } else if result.FundingSignal == "EXTREME_LONG" {
                signalScore -= 2 // Contrarian bearish
        }
        if result.LiquidationSignal == "LIQUIDATION_RISK" {
                signalScore -= 1 // Volatile, caution
        }

        if signalScore > 1 {
                result.OverallSignal = "BULLISH"
        } else if signalScore < -1 {
                result.OverallSignal = "BEARISH"
        } else {
                result.OverallSignal = "NEUTRAL"
        }

        o.cached = result
        o.lastFetch = time.Now()
        return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL RANKING — top crypto by volume with per-coin signal summary
// ═══════════════════════════════════════════════════════════════════════════════

type SignalRankingAnalyzer struct {
        cfg       *Config
        lastFetch time.Time
        cached    *SignalRanking
        prevCoins map[string]struct {
                price float64
                oi    float64
        }
}

func NewSignalRankingAnalyzer(cfg *Config) *SignalRankingAnalyzer {
        return &SignalRankingAnalyzer{
                cfg:       cfg,
                prevCoins: make(map[string]struct {
                        price float64
                        oi    float64
                }),
        }
}

func (sr *SignalRankingAnalyzer) Fetch() *SignalRanking {
        // Rate limit
        if sr.cached != nil && time.Since(sr.lastFetch) < time.Duration(sr.cfg.SignalRankingRefreshSec)*time.Second {
                return sr.cached
        }

        result := &SignalRanking{
                Entries:   []SignalRankingEntry{},
                UpdatedAt: time.Now().UTC().Format("15:04:05 MST"),
        }

        // ── Helper: compute signal from score ──
        computeSignal := func(score int, reasons []string) (string, int, string) {
                absScore := score
                if absScore < 0 { absScore = -absScore }
                strength := min(absScore*12, 100)
                sig := "NEUTRAL"
                if score >= 2 {
                        sig = "LONG"
                } else if score == 1 {
                        sig = "LONG"
                        strength = min(strength, 35)
                } else if score <= -2 {
                        sig = "SHORT"
                } else if score == -1 {
                        sig = "SHORT"
                        strength = min(strength, 35)
                } else {
                        strength = min(strength, 20)
                }
                reason := "No strong signals"
                if len(reasons) > 0 { reason = strings.Join(reasons, " · ") }
                return sig, strength, reason
        }

        // ── Timeframe definitions ──
        // We'll fetch 30m candles (48 = 24h) then aggregate for each timeframe
        type tfDef struct {
                key       string
                candles   int // how many 30m candles make this TF
                volScale  float64 // scale factor for approximate volume
        }
        timeframes := []tfDef{
                {"30m", 1, 1.0},
                {"1h", 2, 1.0},
                {"2h", 4, 1.0},
                {"4h", 8, 1.0},
                {"12h", 24, 1.0},
                {"24h", 48, 1.0},
        }

        // Fetch all coins' meta + context from Hyperliquid
        func() {
                defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (HL Meta): %v", r) } }()

                body, _ := json.Marshal(map[string]interface{}{"type": "metaAndAssetCtxs"})
                resp, err := httpClient.Post(sr.cfg.HLMainnetAPI+"/info", "application/json", strings.NewReader(string(body)))
                if err != nil {
                        logMsg("WARN", "SignalRanking: HL metaAndAssetCtxs HTTP error: %v", err)
                        return
                }
                defer resp.Body.Close()
                data, _ := io.ReadAll(resp.Body)

                var raw []json.RawMessage
                if err := json.Unmarshal(data, &raw); err != nil {
                        logMsg("WARN", "SignalRanking: parse error: %v", err)
                        return
                }
                if len(raw) < 2 { return }

                // Parse universe (coin names)
                var metaObj map[string]interface{}
                json.Unmarshal(raw[0], &metaObj)
                var universe []interface{}
                if u, ok := metaObj["universe"].([]interface{}); ok {
                        universe = u
                }

                // Parse asset contexts
                var assetCtxs []interface{}
                json.Unmarshal(raw[1], &assetCtxs)

                // Also fetch all mid prices
                allMids := make(map[string]float64)
                func() {
                        defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (HL Mids): %v", r) } }()
                        midsResp, midsErr := httpClient.Post(sr.cfg.HLMainnetAPI+"/info", "application/json",
                                strings.NewReader(`{"type":"allMids"}`))
                        if midsErr == nil {
                                defer midsResp.Body.Close()
                                midsData, _ := io.ReadAll(midsResp.Body)
                                var midsMap map[string]string
                                if json.Unmarshal(midsData, &midsMap) == nil {
                                        for k, v := range midsMap {
                                                if f, err := strconv.ParseFloat(v, 64); err == nil {
                                                        allMids[k] = f
                                                }
                                        }
                                }
                        }
                }()

                // Build per-coin entries
                type coinData struct {
                        name      string
                        price     float64
                        volume24h float64
                        oi        float64
                        funding   float64
                        markPx    float64
                        prevDayPx float64
                }

                var coins []coinData
                for i, u := range universe {
                        if m, ok := u.(map[string]interface{}); ok {
                                name, _ := m["name"].(string)
                                if name == "" { continue }
                                cd := coinData{name: name}
                                if i < len(assetCtxs) {
                                        if ac, ok := assetCtxs[i].(map[string]interface{}); ok {
                                                if v, ok := ac["dayNtlVlm"].(string); ok { cd.volume24h, _ = strconv.ParseFloat(v, 64) }
                                                if v, ok := ac["openInterest"].(string); ok { cd.oi, _ = strconv.ParseFloat(v, 64) }
                                                if v, ok := ac["funding"].(string); ok { cd.funding, _ = strconv.ParseFloat(v, 64) }
                                                if v, ok := ac["markPx"].(string); ok { cd.markPx, _ = strconv.ParseFloat(v, 64) }
                                                if v, ok := ac["prevDayPx"].(string); ok { cd.prevDayPx, _ = strconv.ParseFloat(v, 64) }
                                        }
                                }
                                if cd.markPx == 0 { cd.markPx = allMids[name] }
                                cd.price = cd.markPx
                                coins = append(coins, cd)
                        }
                }

                // Sort by 24h volume descending
                sort.Slice(coins, func(i, j int) bool {
                        return coins[i].volume24h > coins[j].volume24h
                })

                result.TotalCoins = len(coins)

                // Take top N
                topN := sr.cfg.SignalRankingTopN
                if topN > len(coins) { topN = len(coins) }
                topCoins := coins[:topN]

                // ── Fetch 30m candles for each top coin (48 candles = 24h) ──
                type coinCandles struct {
                        name    string
                        candles []Candle
                }
                candleMap := make(map[string][]Candle) // coin → 30m candles
                var wg sync.WaitGroup
                var mu sync.Mutex
                for _, cd := range topCoins {
                        wg.Add(1)
                        go func(coinName string) {
                                defer wg.Done()
                                defer func() { if r := recover(); r != nil { logMsg("WARN", "Panic recovered (HL Candles): %v", r) } }()
                                candles, err := fetchHLCandles(coinName, "30m", 50) // 50 × 30m = 25h
                                if err != nil { return }
                                if len(candles) < 5 { return }
                                mu.Lock()
                                candleMap[coinName] = candles
                                mu.Unlock()
                        }(cd.name)
                }
                wg.Wait()

                // ── Build entries with multi-timeframe data ──
                for i, cd := range topCoins {
                        entry := SignalRankingEntry{
                                Rank:          i + 1,
                                Coin:          cd.name,
                                Price:         cd.price,
                                Volume24h:     cd.volume24h,
                                OpenInterest:  cd.oi,
                                FundingRate:   cd.funding,
                                FundingAnnual: cd.funding * 3 * 365 * 100,
                                Timeframes:    make(map[string]*TimeframeData),
                        }

                        // Compute OI change from previous fetch
                        if prev, ok := sr.prevCoins[cd.name]; ok && prev.oi > 0 {
                                entry.OIChangePct = (cd.oi - prev.oi) / prev.oi * 100
                        }

                        // Funding signal (shared across all timeframes)
                        frAnn := cd.funding * 3 * 365 * 100
                        fundingScore := 0
                        var fundingReason string
                        if frAnn > 50 {
                                fundingScore = -3; fundingReason = "Extreme long funding"
                        } else if frAnn > 20 {
                                fundingScore = -2; fundingReason = "High long funding"
                        } else if frAnn > 5 {
                                fundingScore = -1; fundingReason = "Positive funding"
                        } else if frAnn < -50 {
                                fundingScore = 3; fundingReason = "Extreme short funding"
                        } else if frAnn < -20 {
                                fundingScore = 2; fundingReason = "High short funding"
                        } else if frAnn < -5 {
                                fundingScore = 1; fundingReason = "Negative funding"
                        }

                        // OI signal (shared)
                        oiScore := 0
                        var oiReason string
                        if entry.OIChangePct > 5 {
                                oiScore = 1; oiReason = "OI rising"
                        } else if entry.OIChangePct < -5 {
                                oiScore = -1; oiReason = "OI falling"
                        }

                        // Volume/OI signal (shared)
                        volOIScore := 0
                        var volOIReason string
                        if cd.oi > 0 && cd.volume24h > cd.oi*2 { volOIScore = 1; volOIReason = "High vol/OI ratio" }

                        // Compute per-timeframe data from 30m candles
                        candles30m := candleMap[cd.name]

                        for _, tf := range timeframes {
                                tfd := &TimeframeData{}

                                // Extract closes for this TF window
                                var tfCloses []float64
                                startIdx := len(candles30m) - tf.candles
                                if startIdx < 0 { startIdx = 0 }
                                if len(candles30m) > 0 {
                                        for j := startIdx; j < len(candles30m); j++ {
                                                tfCloses = append(tfCloses, candles30m[j].Close)
                                        }
                                }

                                if len(tfCloses) >= 2 {
                                        // Price change: last close vs first close in window
                                        refPrice := tfCloses[0]
                                        if refPrice > 0 && cd.price > 0 {
                                                tfd.PriceChangePct = (cd.price - refPrice) / refPrice * 100
                                        }
                                        // Volume: sum of candles in window
                                        var volSum float64
                                        for j := startIdx; j < len(candles30m); j++ {
                                                volSum += candles30m[j].Volume
                                        }
                                        tfd.Volume = volSum

                                        // Compute RSI(14) from all available candles (need warmup)
                                        if len(candles30m) >= 15 {
                                                var allCloses []float64
                                                for _, c := range candles30m {
                                                        allCloses = append(allCloses, c.Close)
                                                }
                                                rsiArr := calcRSI(allCloses, 14)
                                                if rsiArr != nil {
                                                        lastRSI := rsiArr[len(rsiArr)-1]
                                                        if !math.IsNaN(lastRSI) {
                                                                tfd.RSI = math.Round(lastRSI*10) / 10
                                                        }
                                                }

                                                // Compute BB(20,2) position from all candles
                                                bbU, _, bbL := calcBollinger(allCloses, 20, 2.0)
                                                if len(bbU) > 0 {
                                                        upperVal := bbU[len(bbU)-1]
                                                        lowerVal := bbL[len(bbL)-1]
                                                        bbRange := upperVal - lowerVal
                                                        if bbRange > 0 {
                                                                tfd.BBPosition = math.Round((cd.price-lowerVal)/bbRange*1000) / 10
                                                                if tfd.BBPosition < 0 { tfd.BBPosition = 0 }
                                                                if tfd.BBPosition > 100 { tfd.BBPosition = 100 }
                                                        }
                                                }
                                        }
                                } else {
                                        // Fallback: use prevDayPx for 24h, estimate for others
                                        if tf.key == "24h" && cd.prevDayPx > 0 && cd.price > 0 {
                                                tfd.PriceChangePct = (cd.price - cd.prevDayPx) / cd.prevDayPx * 100
                                        }
                                        tfd.Volume = cd.volume24h * (float64(tf.candles) / 48.0)
                                }

                                // ── Signal scoring for this TF ──
                                score := 0
                                reasons := []string{}

                                // 1. RSI signal (strongest weight)
                                rsi := tfd.RSI
                                if rsi > 0 {
                                        if rsi < 25 {
                                                score += 3; reasons = append(reasons, fmt.Sprintf("RSI %.0f OS", rsi))
                                        } else if rsi < 35 {
                                                score += 2; reasons = append(reasons, fmt.Sprintf("RSI %.0f low", rsi))
                                        } else if rsi < 45 {
                                                score += 1; reasons = append(reasons, fmt.Sprintf("RSI %.0f", rsi))
                                        } else if rsi > 75 {
                                                score -= 3; reasons = append(reasons, fmt.Sprintf("RSI %.0f OB", rsi))
                                        } else if rsi > 65 {
                                                score -= 2; reasons = append(reasons, fmt.Sprintf("RSI %.0f high", rsi))
                                        } else if rsi > 55 {
                                                score -= 1; reasons = append(reasons, fmt.Sprintf("RSI %.0f", rsi))
                                        }
                                }

                                // 2. Bollinger Band position signal
                                bbPos := tfd.BBPosition
                                if bbPos > 0 {
                                        if bbPos < 10 {
                                                score += 3; reasons = append(reasons, "BB lower touch")
                                        } else if bbPos < 25 {
                                                score += 1; reasons = append(reasons, "BB low zone")
                                        } else if bbPos > 90 {
                                                score -= 3; reasons = append(reasons, "BB upper touch")
                                        } else if bbPos > 75 {
                                                score -= 1; reasons = append(reasons, "BB high zone")
                                        }
                                }

                                // 3. Price trend signal (lowered thresholds)
                                chg := tfd.PriceChangePct
                                if chg > 5 {
                                        score += 3; reasons = append(reasons, fmt.Sprintf("+%.1f%%", chg))
                                } else if chg > 2 {
                                        score += 2; reasons = append(reasons, fmt.Sprintf("+%.1f%%", chg))
                                } else if chg > 0.5 {
                                        score += 1; reasons = append(reasons, fmt.Sprintf("+%.1f%%", chg))
                                } else if chg < -5 {
                                        score -= 3; reasons = append(reasons, fmt.Sprintf("%.1f%%", chg))
                                } else if chg < -2 {
                                        score -= 2; reasons = append(reasons, fmt.Sprintf("%.1f%%", chg))
                                } else if chg < -0.5 {
                                        score -= 1; reasons = append(reasons, fmt.Sprintf("%.1f%%", chg))
                                }

                                // 4. Funding contribution
                                if fundingScore != 0 {
                                        score += fundingScore
                                        reasons = append(reasons, fundingReason)
                                }

                                // 5. OI contribution
                                if oiScore != 0 {
                                        score += oiScore
                                        reasons = append(reasons, oiReason)
                                }

                                // 6. Vol/OI contribution
                                if volOIScore != 0 {
                                        score += volOIScore
                                        reasons = append(reasons, volOIReason)
                                }

                                // 7. Volume surge (current TF vol vs half-TF vol)
                                if len(tfCloses) >= 4 {
                                        halfIdx := len(candles30m) - tf.candles/2
                                        if halfIdx < startIdx { halfIdx = startIdx }
                                        var volFirst, volSecond float64
                                        for j := startIdx; j < halfIdx && j < len(candles30m); j++ {
                                                volFirst += candles30m[j].Volume
                                        }
                                        for j := halfIdx; j < len(candles30m); j++ {
                                                volSecond += candles30m[j].Volume
                                        }
                                        if volFirst > 0 && volSecond > volFirst*1.5 {
                                                score += 1; reasons = append(reasons, "Vol surge")
                                        } else if volFirst > 0 && volSecond < volFirst*0.5 {
                                                score -= 1; reasons = append(reasons, "Vol drying")
                                        }
                                }

                                tfd.Signal, tfd.SignalStrength, tfd.SignalReason = computeSignal(score, reasons)
                                entry.Timeframes[tf.key] = tfd
                        }

                        // Default: use 24h signal as the entry's main signal
                        if tf24, ok := entry.Timeframes["24h"]; ok {
                                entry.Signal = tf24.Signal
                                entry.SignalStrength = tf24.SignalStrength
                                entry.SignalReason = tf24.SignalReason
                        }

                        result.Entries = append(result.Entries, entry)
                }

                // Update prev state for delta calculations
                newPrev := make(map[string]struct {
                        price float64
                        oi    float64
                })
                for _, cd := range coins {
                        newPrev[cd.name] = struct {
                                price float64
                                oi    float64
                        }{price: cd.price, oi: cd.oi}
                }
                sr.prevCoins = newPrev
        }()

        sr.cached = result
        sr.lastFetch = time.Now()
        return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET REGIME DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

type RegimeDetector struct {
        cfg       *Config
        snapshots []MarketSnapshot
}

func NewRegimeDetector(cfg *Config) *RegimeDetector {
        return &RegimeDetector{cfg: cfg}
}

func (rd *RegimeDetector) Detect(snap *MarketSnapshot) *MarketRegime {
        rd.snapshots = append(rd.snapshots, *snap)
        if len(rd.snapshots) > rd.cfg.RegimeLookback {
                rd.snapshots = rd.snapshots[len(rd.snapshots)-rd.cfg.RegimeLookback:]
        }

        if len(rd.snapshots) < 10 {
                return &MarketRegime{Regime: "MEDIUM", Confidence: 50, RecommendedStrategy: "MODERATE", PositionMultiplier: 1.0, StopLossMultiplier: 1.0}
        }

        // Compute ADX-like metric from price changes
        var sumUp, sumDown float64
        for i := 1; i < len(rd.snapshots); i++ {
                change := rd.snapshots[i].Price - rd.snapshots[i-1].Price
                if change > 0 { sumUp += change } else { sumDown += -change }
        }
        totalMovement := sumUp + sumDown
        adx := 0.0
        if totalMovement > 0 && rd.snapshots[0].Price > 0 {
                netMove := math.Abs(sumUp - sumDown) / rd.snapshots[0].Price * 100
                adx = netMove * float64(len(rd.snapshots)) / 10
        }

        regime := "RANGING"
        strategy := "SCALP"
        posMult := 0.7
        slMult := 1.2

        if adx > rd.cfg.RegimeTrendADXThreshold {
                regime = "TRENDING"
                strategy = "TREND"
                posMult = 1.2
                slMult = 0.8
        }
        if snap.VolatilityPct > rd.cfg.VolatilityHighPct {
                regime = "VOLATILE"
                strategy = "CAUTIOUS"
                posMult = 0.5
                slMult = 1.5
        }

        confidence := math.Min(adx/50*100, 100)
        atrPct := snap.VolatilityPct

        return &MarketRegime{
                Regime: regime, Confidence: math.Round(confidence),
                ADX: math.Round(adx*10)/10, ATRPct: atrPct,
                RecommendedStrategy: strategy,
                PositionMultiplier: posMult, StopLossMultiplier: slMult,
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RISK METRICS
// ═══════════════════════════════════════════════════════════════════════════════

type RiskEngine struct {
        cfg *Config
}

func NewRiskEngine(cfg *Config) *RiskEngine {
        return &RiskEngine{cfg: cfg}
}

func (re *RiskEngine) Calculate(snap *MarketSnapshot, paperBalance float64) *RiskMetrics {
        // Simplified VaR (95%)
        var95 := 0.0
        if snap.VolatilityPct > 0 && paperBalance > 0 {
                var95 = paperBalance * snap.VolatilityPct / 100 * 1.645 // 95% Z-score
        }

        // Kelly Criterion
        kelly := 0.0
        if snap.VolatilityPct > 0 {
                // Simplified: kelly = (winProb * avgWin - loseProb * avgLoss) / avgWin
                kelly = 2.0 // Conservative estimate
        }

        // Position concentration
        concentration := 0.0
        if paperBalance > 0 {
                concentration = float64(re.cfg.OrderSizeUSD) * float64(re.cfg.Leverage) / paperBalance * 100
        }

        // Daily VaR usage
        dailyVarUsed := 0.0
        if var95 > 0 {
                dailyVarUsed = math.Abs(snap.VolatilityPct) / (var95 / paperBalance * 100) * 100
        }

        // Composite risk score (0-100)
        riskScore := 0.0
        riskScore += math.Min(concentration/re.cfg.RiskMaxPositionPct*30, 30)
        riskScore += math.Min(float64(re.cfg.Leverage)/float64(re.cfg.RiskMaxLeverage)*30, 30)
        if snap.VolatilityPct > re.cfg.VolatilityHighPct { riskScore += 20 }
        if math.Abs(snap.OBImbalance) > re.cfg.OBImbalanceRatio { riskScore += 10 }
        if snap.FundingNear { riskScore += 10 }

        return &RiskMetrics{
                VaR95: math.Round(var95*100)/100,
                KellyCriterion: math.Round(kelly*100)/100,
                CurrentLeverage: float64(re.cfg.Leverage),
                PositionConcentration: math.Round(concentration*10)/10,
                DailyVaRUsedPct: math.Round(dailyVarUsed*10)/10,
                CompositeRiskScore: math.Round(math.Min(riskScore, 100)),
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCALPING ENGINE (v0.1) — Micro-trade engine with 5 concurrent positions
// ═══════════════════════════════════════════════════════════════════════════════

type ScalpPosition struct {
        ID          int       `json:"id"`
        Side        string    `json:"side"`         // LONG / SHORT
        EntryPrice  float64   `json:"entryPrice"`
        SizeUSD     float64   `json:"sizeUsd"`
        StopLoss    float64   `json:"stopLoss"`
        TakeProfit  float64   `json:"takeProfit"`
        Leverage    int       `json:"leverage"`
        Reason      string    `json:"reason"`
        OpenedAt    time.Time `json:"-"`
        OpenedAgo   float64   `json:"openedAgo"`    // seconds, computed
}

type ScalpTradeResult struct {
        ID          int     `json:"id"`
        Side        string  `json:"side"`
        EntryPrice  float64 `json:"entryPrice"`
        ExitPrice   float64 `json:"exitPrice"`
        SizeUSD     float64 `json:"sizeUsd"`
        PnL         float64 `json:"pnl"`
        PnLPct      float64 `json:"pnlPct"`
        Fees        float64 `json:"fees"`
        NetPnL      float64 `json:"netPnl"`
        DurationSec float64 `json:"durationSec"`
        Reason      string  `json:"reason"`
}

type ScalpingEngine struct {
        MaxPositions      int
        SLPct             float64
        TPPct             float64
        TrailingActivatePct float64
        TrailingStepPct   float64
        OrderSizeUSD      float64
        Leverage          int
        FeeRate           float64
        FundingSafeMin    float64
        MaxDurationSec    float64

        Positions    []*ScalpPosition
        ClosedTrades []*ScalpTradeResult
        nextID       int
        totalPnL     float64
        totalFees    float64
        wins         int
        losses       int
        peakEquity   float64
        maxDrawdown  float64
        balance      float64
        equityCurve  []float64
        activeRegime string
}

func NewScalpingEngine() *ScalpingEngine {
        return &ScalpingEngine{
                MaxPositions:        5,
                SLPct:              0.50,
                TPPct:              1.00,
                TrailingActivatePct: 0.50,
                TrailingStepPct:    0.15,
                OrderSizeUSD:       10.0,
                Leverage:           3,
                FeeRate:            0.00035,
                FundingSafeMin:     5.0,
                MaxDurationSec:     600,
                balance:            1000.0,
                equityCurve:        []float64{1000.0},
                activeRegime:       "RANGE",
                nextID:             1,
        }
}

func (se *ScalpingEngine) SetRegime(regime string) {
        se.activeRegime = regime
}

type scalpSignal struct {
        Direction string
        Strength  float64
        Reason    string
        Source    string
}

func (se *ScalpingEngine) CheckEntrySignals(snap *MarketSnapshot) []scalpSignal {
        var signals []scalpSignal

        // GUARD: no trading in HIGH volatility or near funding
        if snap.VolatilityRegime == "HIGH" {
                return signals
        }
        if snap.FundingNear {
                return signals
        }
        if snap.FundingCountdownMin >= 0 && snap.FundingCountdownMin < se.FundingSafeMin {
                return signals
        }
        if len(se.Positions) >= se.MaxPositions {
                return signals
        }

        // Signal 1: OB Imbalance > 30%
        if math.Abs(snap.OBImbalance) > 0.30 {
                dir := "LONG"
                if snap.OBImbalance < 0 {
                        dir = "SHORT"
                }
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  math.Min(math.Abs(snap.OBImbalance), 1.0),
                        Reason:    fmt.Sprintf("OB imbalance %.2f", snap.OBImbalance),
                        Source:    "ob_imbalance",
                })
        }

        // Signal 2: RSI oversold/overbought
        rsi := snap.RSI
        if rsi > 0 {
                if rsi < 30 {
                        signals = append(signals, scalpSignal{
                                Direction: "LONG",
                                Strength:  (30 - rsi) / 30,
                                Reason:    fmt.Sprintf("RSI oversold %.1f", rsi),
                                Source:    "rsi",
                        })
                } else if rsi > 70 {
                        signals = append(signals, scalpSignal{
                                Direction: "SHORT",
                                Strength:  (rsi - 70) / 30,
                                Reason:    fmt.Sprintf("RSI overbought %.1f", rsi),
                                Source:    "rsi",
                        })
                }
        }

        // Signal 3: MACD histogram flip
        macdHist := snap.MACDHistogram
        if macdHist != 0 {
                // Use sign of histogram as direction proxy
                if macdHist > 0 {
                        signals = append(signals, scalpSignal{
                                Direction: "LONG",
                                Strength:  math.Min(math.Abs(macdHist)/50, 1.0),
                                Reason:    "MACD histogram bullish",
                                Source:    "macd",
                        })
                } else {
                        signals = append(signals, scalpSignal{
                                Direction: "SHORT",
                                Strength:  math.Min(math.Abs(macdHist)/50, 1.0),
                                Reason:    "MACD histogram bearish",
                                Source:    "macd",
                        })
                }
        }

        // Signal 4: Price at BB support/resistance
        if snap.BBLower > 0 && snap.Price > 0 && snap.BBUpper > snap.BBLower {
                bbRange := snap.BBUpper - snap.BBLower
                bbPos := (snap.Price - snap.BBLower) / bbRange
                if bbPos < 0.10 {
                        signals = append(signals, scalpSignal{
                                Direction: "LONG",
                                Strength:  0.6,
                                Reason:    fmt.Sprintf("Price at BB lower (%.0f%%)", bbPos*100),
                                Source:    "bb_support",
                        })
                } else if bbPos > 0.90 {
                        signals = append(signals, scalpSignal{
                                Direction: "SHORT",
                                Strength:  0.6,
                                Reason:    fmt.Sprintf("Price at BB upper (%.0f%%)", bbPos*100),
                                Source:    "bb_resistance",
                        })
                }
        }

        // Signal 5: CVD divergence
        if math.Abs(snap.CVDDivergence) > 0.5 {
                dir := "LONG"
                if snap.CVDDivergence < 0 {
                        dir = "SHORT"
                }
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  math.Min(math.Abs(snap.CVDDivergence)/3.0, 1.0),
                        Reason:    fmt.Sprintf("CVD divergence %.1f%%", snap.CVDDivergence),
                        Source:    "cvd_divergence",
                })
        }

        // Signal 6: OFI net
        if math.Abs(snap.OFINet) > 50000 {
                dir := "LONG"
                if snap.OFINet < 0 {
                        dir = "SHORT"
                }
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  math.Min(math.Abs(snap.OFINet)/500000, 1.0),
                        Reason:    fmt.Sprintf("OFI $%.0f", snap.OFINet),
                        Source:    "ofi",
                })
        }

        return signals
}

type ScalpDecision struct {
        Direction  string
        Confidence float64
        Reasons    []string
}

func (se *ScalpingEngine) AggregateSignals(signals []scalpSignal) *ScalpDecision {
        if len(signals) == 0 {
                return nil
        }

        var longScore, shortScore float64
        var longCount, shortCount int
        var longReasons, shortReasons []string

        for _, s := range signals {
                if s.Direction == "LONG" {
                        longScore += s.Strength
                        longCount++
                        longReasons = append(longReasons, s.Reason)
                } else {
                        shortScore += s.Strength
                        shortCount++
                        shortReasons = append(shortReasons, s.Reason)
                }
        }

        // Need at least 2 concurring signals
        if longCount >= 2 && longScore > shortScore {
                return &ScalpDecision{
                        Direction:  "LONG",
                        Confidence: math.Min(longScore*50, 90),
                        Reasons:    longReasons[:min(3, len(longReasons))],
                }
        }
        if shortCount >= 2 && shortScore > longScore {
                return &ScalpDecision{
                        Direction:  "SHORT",
                        Confidence: math.Min(shortScore*50, 90),
                        Reasons:    shortReasons[:min(3, len(shortReasons))],
                }
        }
        return nil
}

func (se *ScalpingEngine) OpenPosition(direction string, entryPrice float64, reason string) *ScalpPosition {
        if len(se.Positions) >= se.MaxPositions || entryPrice <= 0 {
                return nil
        }

        var sl, tp float64
        if direction == "LONG" {
                sl = entryPrice * (1 - se.SLPct/100)
                tp = entryPrice * (1 + se.TPPct/100)
        } else {
                sl = entryPrice * (1 + se.SLPct/100)
                tp = entryPrice * (1 - se.TPPct/100)
        }

        pos := &ScalpPosition{
                ID:         se.nextID,
                Side:       direction,
                EntryPrice: entryPrice,
                SizeUSD:    se.OrderSizeUSD,
                StopLoss:   sl,
                TakeProfit: tp,
                Leverage:   se.Leverage,
                Reason:     reason,
                OpenedAt:   time.Now(),
        }
        se.nextID++
        se.Positions = append(se.Positions, pos)
        se.balance -= pos.SizeUSD / float64(pos.Leverage)
        return pos
}

func (se *ScalpingEngine) CheckExits(currentPrice float64) {
        now := time.Now()
        var remaining []*ScalpPosition

        for _, pos := range se.Positions {
                shouldClose := false
                exitReason := ""

                // Calculate PnL
                var pnlPct float64
                if pos.Side == "LONG" {
                        pnlPct = (currentPrice - pos.EntryPrice) / pos.EntryPrice * 100
                } else {
                        pnlPct = (pos.EntryPrice - currentPrice) / pos.EntryPrice * 100
                }
                pnlUSD := pnlPct / 100 * pos.SizeUSD * float64(pos.Leverage)

                // Check SL
                if pos.Side == "LONG" && currentPrice <= pos.StopLoss {
                        shouldClose = true
                        exitReason = "SL hit"
                } else if pos.Side == "SHORT" && currentPrice >= pos.StopLoss {
                        shouldClose = true
                        exitReason = "SL hit"
                }

                // Check TP
                if pos.Side == "LONG" && currentPrice >= pos.TakeProfit {
                        shouldClose = true
                        exitReason = "TP hit"
                } else if pos.Side == "SHORT" && currentPrice <= pos.TakeProfit {
                        shouldClose = true
                        exitReason = "TP hit"
                }

                // Trailing stop
                if !shouldClose && pnlPct >= se.TPPct*se.TrailingActivatePct {
                        if pos.Side == "LONG" {
                                newSL := currentPrice * (1 - se.TrailingStepPct/100)
                                if newSL > pos.StopLoss {
                                        pos.StopLoss = newSL
                                }
                        } else {
                                newSL := currentPrice * (1 + se.TrailingStepPct/100)
                                if newSL < pos.StopLoss {
                                        pos.StopLoss = newSL
                                }
                        }
                }

                // Duration timeout
                duration := now.Sub(pos.OpenedAt).Seconds()
                if duration > se.MaxDurationSec {
                        shouldClose = true
                        exitReason = fmt.Sprintf("Timeout (%.0fs)", duration)
                }

                if shouldClose {
                        fees := pos.SizeUSD * se.FeeRate * 2 * float64(pos.Leverage)
                        netPnL := pnlUSD - fees
                        result := &ScalpTradeResult{
                                ID:          pos.ID,
                                Side:        pos.Side,
                                EntryPrice:  pos.EntryPrice,
                                ExitPrice:   currentPrice,
                                SizeUSD:     pos.SizeUSD,
                                PnL:         math.Round(pnlUSD*10000) / 10000,
                                PnLPct:      math.Round(pnlPct*10000) / 10000,
                                Fees:        math.Round(fees*10000) / 10000,
                                NetPnL:      math.Round(netPnL*10000) / 10000,
                                DurationSec: math.Round(duration*10) / 10,
                                Reason:      exitReason,
                        }
                        se.ClosedTrades = append(se.ClosedTrades, result)

                        // Update stats
                        margin := pos.SizeUSD / float64(pos.Leverage)
                        se.balance += margin + netPnL
                        se.totalPnL += netPnL
                        se.totalFees += fees
                        if netPnL >= 0 {
                                se.wins++
                        } else {
                                se.losses++
                        }

                        // Track equity
                        equity := se.balance
                        for _, p := range se.Positions {
                                if p == pos {
                                        continue
                                }
                                if p.Side == "LONG" {
                                        equity += (currentPrice - p.EntryPrice) / p.EntryPrice * p.SizeUSD * float64(p.Leverage)
                                } else {
                                        equity += (p.EntryPrice - currentPrice) / p.EntryPrice * p.SizeUSD * float64(p.Leverage)
                                }
                        }
                        equity = math.Round(equity*100) / 100
                        se.equityCurve = append(se.equityCurve, equity)
                        if equity > se.peakEquity {
                                se.peakEquity = equity
                        }
                        if se.peakEquity > 0 {
                                dd := (se.peakEquity - equity) / se.peakEquity * 100
                                if dd > se.maxDrawdown {
                                        se.maxDrawdown = dd
                                }
                        }
                } else {
                        remaining = append(remaining, pos)
                }
        }
        se.Positions = remaining
}

func (se *ScalpingEngine) GetStatus() map[string]interface{} {
        totalTrades := se.wins + se.losses
        winRate := 0.0
        if totalTrades > 0 {
                winRate = float64(se.wins) / float64(totalTrades) * 100
        }

        // Build positions with computed openedAgo
        positions := make([]map[string]interface{}, len(se.Positions))
        for i, p := range se.Positions {
                positions[i] = map[string]interface{}{
                        "id":         p.ID,
                        "side":       p.Side,
                        "entryPrice": p.EntryPrice,
                        "sizeUsd":    p.SizeUSD,
                        "stopLoss":   p.StopLoss,
                        "takeProfit": p.TakeProfit,
                        "leverage":   p.Leverage,
                        "reason":     p.Reason,
                        "openedAgo":  math.Round(time.Since(p.OpenedAt).Seconds()),
                }
        }

        // Trim equity curve to last 120 points
        curve := se.equityCurve
        if len(curve) > 120 {
                curve = curve[len(curve)-120:]
        }

        return map[string]interface{}{
                "activePositions": len(se.Positions),
                "maxPositions":    se.MaxPositions,
                "positions":       positions,
                "totalPnl":        math.Round(se.totalPnL*10000) / 10000,
                "totalFees":       math.Round(se.totalFees*10000) / 10000,
                "wins":            se.wins,
                "losses":          se.losses,
                "totalTrades":     totalTrades,
                "winRate":         math.Round(winRate*10) / 10,
                "maxDrawdown":     math.Round(se.maxDrawdown*100) / 100,
                "balance":         math.Round(se.balance*100) / 100,
                "equityCurve":     curve,
                "regime":          se.activeRegime,
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKTEST ENGINE (Historical Candle Replay)
// ═══════════════════════════════════════════════════════════════════════════════
// Imports 1000+ historical candles from Binance, computes indicators on a
// rolling window, replays each candle through the ScalpingEngine's signal
// logic, and tracks full trade statistics with equity curve.

type BacktestTrade struct {
        ID          int     `json:"id"`
        Side        string  `json:"side"`
        EntryPrice  float64 `json:"entryPrice"`
        ExitPrice   float64 `json:"exitPrice"`
        EntryTime   int64   `json:"entryTime"`
        ExitTime    int64   `json:"exitTime"`
        SizeUSD     float64 `json:"sizeUsd"`
        PnL         float64 `json:"pnl"`
        PnLPct      float64 `json:"pnlPct"`
        Fees        float64 `json:"fees"`
        NetPnL      float64 `json:"netPnl"`
        DurationBars int    `json:"durationBars"`
        ExitReason  string  `json:"exitReason"`
}

type BacktestPosition struct {
        ID         int
        Side       string
        EntryPrice float64
        EntryIdx   int
        EntryTime  int64
        SizeUSD    float64
        StopLoss   float64
        TakeProfit float64
        Leverage   int
        DCAEntry   int     // DCA entry level: 1, 2, or 3 (0 = not DCA)
        DCAMult    float64 // DCA size multiplier: 1, 2, or 4
}

type BacktestEngine struct {
        cfg            *Config
        candles        []Candle
        positions      []*BacktestPosition
        closedTrades   []BacktestTrade
        balance        float64
        initBalance    float64
        totalPnL       float64
        totalFees      float64
        wins           int
        losses         int
        peakEquity     float64
        maxDrawdown    float64
        equityCurve    []float64
        nextID         int
        running        bool
        progressPct    float64
        snapshotsUsed  int
        dataSource     string // "binance" or "hyperliquid"
        // DCA state for trigger backtest
        dcaActive    bool
        dcaDirection string  // "LONG" or "SHORT"
        dcaEntries   int     // number of DCA entries made (1, 2, 3)
        dcaBaseSize  float64 // base size for DCA entry 1
        // Indicator rolling window
        closeWindow    []float64
        windowSize     int
        // EMA tracking for crossover signals
        emaFast        []float64
        emaSlow        []float64
        volumeHistory  []float64
}

func NewBacktestEngine(cfg *Config) *BacktestEngine {
        return &BacktestEngine{
                cfg:         cfg,
                initBalance: cfg.BacktestInitBalance,
                balance:     cfg.BacktestInitBalance,
                windowSize:  60, // Need at least 60 bars for MACD(26) + signal(9) warmup
                equityCurve: []float64{cfg.BacktestInitBalance},
                nextID:      1,
                dataSource:  "binance",
        }
}

// ImportCandles fetches historical candles from Binance or Hyperliquid API.
// Returns the number of candles imported.
func (be *BacktestEngine) ImportCandles(symbol, interval string, limit int, source string) (int, error) {
        be.dataSource = source
        logMsg("INFO", "BacktestEngine: Importowanie %d świec %s %s [%s]...", limit, symbol, interval, source)

        var candles []Candle
        var err error

        if source == "hyperliquid" {
                // For HL, coin name is just the base (e.g., "BTC" not "BTCUSDT")
                coin := strings.TrimSuffix(symbol, "USDT")
                candles, err = fetchHLCandles(coin, interval, limit)
                if err != nil {
                        logMsg("WARN", "HL fetch failed: %v — falling back to Binance", err)
                        candles, err = fetchBinanceCandles(symbol, interval, limit)
                        if err == nil {
                                be.dataSource = "binance"
                        }
                }
        } else {
                // Default: Binance with pagination
                candles, err = fetchBinanceCandles(symbol, interval, limit)
        }

        if err != nil {
                return 0, fmt.Errorf("Błąd importu: %v", err)
        }
        if len(candles) < 1000 {
                return 0, fmt.Errorf("Za mało świec: %d (min 1000 dla wiarygodnego backtestu)", len(candles))
        }
        be.candles = candles
        logMsg("INFO", "BacktestEngine: Zaimportowano %d świec [%s]", len(candles), be.dataSource)
        return len(candles), nil
}

// Run executes the backtest over all imported candles.
func (be *BacktestEngine) Run() map[string]interface{} {
        if len(be.candles) < 1000 {
                return map[string]interface{}{"error": fmt.Sprintf("Za mało danych: %d świec (min 1000)", len(be.candles))}
        }

        // Reset state
        be.positions = nil
        be.closedTrades = nil
        be.balance = be.initBalance
        be.totalPnL = 0
        be.totalFees = 0
        be.wins = 0
        be.losses = 0
        be.peakEquity = be.initBalance
        be.maxDrawdown = 0
        be.equityCurve = []float64{be.initBalance}
        be.nextID = 1
        be.closeWindow = nil
        be.emaFast = nil
        be.emaSlow = nil
        be.volumeHistory = nil
        be.running = true
        be.progressPct = 0

        totalBars := len(be.candles)
        logMsg("INFO", "BacktestEngine: Uruchamianie backtestu na %d świecach...", totalBars)

        lastProgressEmit := 0

        for i, candle := range be.candles {
                if !be.running {
                        break
                }

                // Build rolling close window for indicators
                be.closeWindow = append(be.closeWindow, candle.Close)
                // Keep window manageable — only need last ~200 for indicators
                if len(be.closeWindow) > 200 {
                        be.closeWindow = be.closeWindow[len(be.closeWindow)-200:]
                }

                // Track volume for volume spike detection
                be.volumeHistory = append(be.volumeHistory, candle.Volume)
                if len(be.volumeHistory) > 50 {
                        be.volumeHistory = be.volumeHistory[len(be.volumeHistory)-50:]
                }

                // Update progress
                be.progressPct = float64(i) / float64(totalBars) * 100

                // Emit progress every 10% for live updates
                pct10 := int(be.progressPct / 10)
                if pct10 > lastProgressEmit {
                        lastProgressEmit = pct10
                        emitJSON("BACKTEST_JSON:", map[string]interface{}{
                                "status":      "running",
                                "candleCount": i + 1,
                                "interval":    be.cfg.BacktestCandleInterval,
                                "progressPct": math.Round(be.progressPct),
                        })
                }

                // Skip until we have enough data for indicator warmup
                if len(be.closeWindow) < be.windowSize {
                        continue
                }

                // Compute indicators from rolling window
                rsiArr := calcRSI(be.closeWindow, 14)
                _, _, macdHist := calcMACD(be.closeWindow)
                bbUpper, bbMiddle, bbLower := calcBollinger(be.closeWindow, 20, 2.0)

                // Compute EMAs for crossover signal
                emaFast := calcEMA(be.closeWindow, 9)
                emaSlow := calcEMA(be.closeWindow, 21)

                // Extract latest indicator values
                var rsi, macdH, bbUp, bbMid, bbLo float64
                for j := len(rsiArr) - 1; j >= 0; j-- {
                        if !math.IsNaN(rsiArr[j]) {
                                rsi = rsiArr[j]
                                break
                        }
                }
                if len(macdHist) > 0 {
                        macdH = macdHist[len(macdHist)-1]
                }
                if len(bbUpper) > 0 {
                        bbUp = bbUpper[len(bbUpper)-1]
                        bbMid = bbMiddle[len(bbMiddle)-1]
                        bbLo = bbLower[len(bbLower)-1]
                }

                // EMA crossover detection
                var emaFastVal, emaSlowVal float64
                if len(emaFast) > 0 { emaFastVal = emaFast[len(emaFast)-1] }
                if len(emaSlow) > 0 { emaSlowVal = emaSlow[len(emaSlow)-1] }
                var prevEmaFast, prevEmaSlow float64
                if len(emaFast) > 1 { prevEmaFast = emaFast[len(emaFast)-2] }
                if len(emaSlow) > 1 { prevEmaSlow = emaSlow[len(emaSlow)-2] }
                emaCrossUp := prevEmaFast <= prevEmaSlow && emaFastVal > emaSlowVal
                emaCrossDown := prevEmaFast >= prevEmaSlow && emaFastVal < emaSlowVal

                // Volume spike detection
                var volSpike float64
                if len(be.volumeHistory) >= 20 {
                        var avgVol float64
                        for _, v := range be.volumeHistory[:len(be.volumeHistory)-1] {
                                avgVol += v
                        }
                        avgVol /= float64(len(be.volumeHistory) - 1)
                        if avgVol > 0 {
                                volSpike = candle.Volume / avgVol
                        }
                }

                // Build a synthetic MarketSnapshot from candle data
                snap := &MarketSnapshot{
                        Iteration:    i,
                        Coin:         be.cfg.Coin,
                        Price:        candle.Close,
                        Volume:       candle.Volume,
                        RSI:          rsi,
                        MACDHistogram: macdH,
                        BBUpper:      bbUp,
                        BBMiddle:     bbMid,
                        BBLower:      bbLo,
                        // Approximate volatility from candle range
                        VolatilityRegime: "MEDIUM",
                        VolatilityPct:    0,
                }
                if candle.High > 0 && candle.Low > 0 {
                        rangePct := (candle.High - candle.Low) / candle.Low * 100
                        snap.VolatilityPct = rangePct
                        if rangePct < be.cfg.VolatilityLowPct {
                                snap.VolatilityRegime = "LOW"
                        } else if rangePct > be.cfg.VolatilityHighPct {
                                snap.VolatilityRegime = "HIGH"
                        }
                }

                // Compute OB Imbalance proxy from candle body direction
                if candle.Open > 0 {
                        bodyPct := (candle.Close - candle.Open) / candle.Open
                        snap.OBImbalance = bodyPct * 5 // Amplify for signal detection
                }

                // ── Check entries (same logic as ScalpingEngine) ──
                be.checkEntry(snap, candle, emaCrossUp, emaCrossDown, volSpike)

                // ── Check exits on every candle ──
                be.checkExits(candle, i)

                // ── Record equity snapshot every 10 bars ──
                if i%10 == 0 {
                        equity := be.computeEquity(candle.Close)
                        be.equityCurve = append(be.equityCurve, math.Round(equity*100)/100)
                        if equity > be.peakEquity {
                                be.peakEquity = equity
                        }
                        if be.peakEquity > 0 {
                                dd := (be.peakEquity - equity) / be.peakEquity * 100
                                if dd > be.maxDrawdown {
                                        be.maxDrawdown = dd
                                }
                        }
                }
        }

        // Close any remaining positions at last candle price
        lastPrice := be.candles[len(be.candles)-1].Close
        for _, pos := range be.positions {
                be.closePosition(pos, lastPrice, len(be.candles)-1, "Backtest end")
        }
        be.positions = nil

        // Final equity point
        finalEquity := be.balance
        be.equityCurve = append(be.equityCurve, math.Round(finalEquity*100)/100)

        be.running = false
        be.progressPct = 100
        be.snapshotsUsed = totalBars

        logMsg("INFO", "BacktestEngine: Zakończono — %d trade'ów, WR %.1f%%, PnL $%.2f",
                be.wins+be.losses, be.winRate()*100, be.totalPnL)

        return be.buildResult()
}

func (be *BacktestEngine) checkEntry(snap *MarketSnapshot, candle Candle, emaCrossUp, emaCrossDown bool, volSpike float64) {
        maxPos := 5
        if len(be.positions) >= maxPos {
                return
        }
        // Guard: no new entries in HIGH volatility
        if snap.VolatilityRegime == "HIGH" {
                return
        }

        var signals []scalpSignal

        // Signal 1: OB Imbalance
        if math.Abs(snap.OBImbalance) > 0.30 {
                dir := "LONG"
                if snap.OBImbalance < 0 {
                        dir = "SHORT"
                }
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  math.Min(math.Abs(snap.OBImbalance), 1.0),
                        Reason:    fmt.Sprintf("OB imbalance %.2f", snap.OBImbalance),
                        Source:    "ob_imbalance",
                })
        }

        // Signal 2: RSI oversold/overbought
        if snap.RSI > 0 {
                if snap.RSI < 30 {
                        signals = append(signals, scalpSignal{
                                Direction: "LONG",
                                Strength:  (30 - snap.RSI) / 30,
                                Reason:    fmt.Sprintf("RSI oversold %.1f", snap.RSI),
                                Source:    "rsi",
                        })
                } else if snap.RSI > 70 {
                        signals = append(signals, scalpSignal{
                                Direction: "SHORT",
                                Strength:  (snap.RSI - 70) / 30,
                                Reason:    fmt.Sprintf("RSI overbought %.1f", snap.RSI),
                                Source:    "rsi",
                        })
                }
        }

        // Signal 3: MACD histogram
        if snap.MACDHistogram != 0 {
                dir := "SHORT"
                strength := math.Min(math.Abs(snap.MACDHistogram)/50, 1.0)
                if snap.MACDHistogram > 0 {
                        dir = "LONG"
                }
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  strength,
                        Reason:    fmt.Sprintf("MACD hist %s", dir),
                        Source:    "macd",
                })
        }

        // Signal 4: Bollinger Band support/resistance
        if snap.BBLower > 0 && snap.Price > 0 && snap.BBUpper > snap.BBLower {
                bbRange := snap.BBUpper - snap.BBLower
                bbPos := (snap.Price - snap.BBLower) / bbRange
                if bbPos < 0.10 {
                        signals = append(signals, scalpSignal{
                                Direction: "LONG",
                                Strength:  0.6,
                                Reason:    fmt.Sprintf("BB lower (%.0f%%)", bbPos*100),
                                Source:    "bb_support",
                        })
                } else if bbPos > 0.90 {
                        signals = append(signals, scalpSignal{
                                Direction: "SHORT",
                                Strength:  0.6,
                                Reason:    fmt.Sprintf("BB upper (%.0f%%)", bbPos*100),
                                Source:    "bb_resistance",
                        })
                }
        }

        // Signal 5: EMA crossover (strong signal)
        if emaCrossUp {
                signals = append(signals, scalpSignal{
                        Direction: "LONG",
                        Strength:  0.75,
                        Reason:    "EMA 9/21 bullish cross",
                        Source:    "ema_cross",
                })
        }
        if emaCrossDown {
                signals = append(signals, scalpSignal{
                        Direction: "SHORT",
                        Strength:  0.75,
                        Reason:    "EMA 9/21 bearish cross",
                        Source:    "ema_cross",
                })
        }

        // Signal 6: Volume spike confirmation
        if volSpike >= 2.0 {
                // Volume spike confirms direction of current candle
                dir := "LONG"
                if candle.Close < candle.Open {
                        dir = "SHORT"
                }
                strength := math.Min((volSpike-1.0)/3.0, 0.8)
                signals = append(signals, scalpSignal{
                        Direction: dir,
                        Strength:  strength,
                        Reason:    fmt.Sprintf("Vol spike %.1fx", volSpike),
                        Source:    "volume_spike",
                })
        }

        // Aggregate: need ≥2 concurring signals
        var longScore, shortScore float64
        var longCount, shortCount int
        var longReasons, shortReasons []string
        for _, s := range signals {
                if s.Direction == "LONG" {
                        longScore += s.Strength
                        longCount++
                        longReasons = append(longReasons, s.Reason)
                } else {
                        shortScore += s.Strength
                        shortCount++
                        shortReasons = append(shortReasons, s.Reason)
                }
        }

        var direction string
        if longCount >= 2 && longScore > shortScore {
                direction = "LONG"
        } else if shortCount >= 2 && shortScore > longScore {
                direction = "SHORT"
        }

        if direction == "" {
                return
        }

        // Don't open if we already have a position in same direction
        for _, p := range be.positions {
                if p.Side == direction {
                        return
                }
        }

        // Open position
        entryPrice := candle.Close
        slPct := be.cfg.BacktestSLPct
        tpPct := be.cfg.BacktestTPPct
        if slPct <= 0 { slPct = be.cfg.StopLossPct }
        if tpPct <= 0 { tpPct = be.cfg.TakeProfitPct }

        var sl, tp float64
        if direction == "LONG" {
                sl = entryPrice * (1 - slPct/100)
                tp = entryPrice * (1 + tpPct/100)
        } else {
                sl = entryPrice * (1 + slPct/100)
                tp = entryPrice * (1 - tpPct/100)
        }

        pos := &BacktestPosition{
                ID:         be.nextID,
                Side:       direction,
                EntryPrice: entryPrice,
                EntryIdx:   snap.Iteration,
                EntryTime:  candle.OpenTime,
                SizeUSD:    be.cfg.OrderSizeUSD,
                StopLoss:   sl,
                TakeProfit: tp,
                Leverage:   be.cfg.Leverage,
        }
        be.nextID++
        be.positions = append(be.positions, pos)
        margin := pos.SizeUSD / float64(pos.Leverage)
        be.balance -= margin
}

func (be *BacktestEngine) checkExits(candle Candle, barIdx int) {
        var remaining []*BacktestPosition
        for _, pos := range be.positions {
                shouldClose := false
                exitReason := ""
                exitPx := candle.Close

                // Check SL — use candle Low/High for realistic fill simulation
                if pos.Side == "LONG" && candle.Low <= pos.StopLoss {
                        shouldClose = true
                        exitReason = "SL hit"
                        exitPx = pos.StopLoss
                } else if pos.Side == "SHORT" && candle.High >= pos.StopLoss {
                        shouldClose = true
                        exitReason = "SL hit"
                        exitPx = pos.StopLoss
                }

                // Check TP
                if !shouldClose {
                        if pos.Side == "LONG" && candle.High >= pos.TakeProfit {
                                shouldClose = true
                                exitReason = "TP hit"
                                exitPx = pos.TakeProfit
                        } else if pos.Side == "SHORT" && candle.Low <= pos.TakeProfit {
                                shouldClose = true
                                exitReason = "TP hit"
                                exitPx = pos.TakeProfit
                        }
                }

                // Max duration: 100 bars (e.g., 100 hours on 1h interval)
                if !shouldClose && barIdx-pos.EntryIdx > 100 {
                        shouldClose = true
                        exitReason = "Timeout"
                }

                if shouldClose {
                        be.closePosition(pos, exitPx, barIdx, exitReason)
                } else {
                        remaining = append(remaining, pos)
                }
        }
        be.positions = remaining
}

func (be *BacktestEngine) closePosition(pos *BacktestPosition, exitPrice float64, exitIdx int, reason string) {
        var pnlPct float64
        if pos.Side == "LONG" {
                pnlPct = (exitPrice - pos.EntryPrice) / pos.EntryPrice * 100
        } else {
                pnlPct = (pos.EntryPrice - exitPrice) / pos.EntryPrice * 100
        }
        pnlUSD := pnlPct / 100 * pos.SizeUSD * float64(pos.Leverage)
        fees := pos.SizeUSD * be.cfg.BacktestFeeRate * 2 * float64(pos.Leverage)
        netPnL := pnlUSD - fees

        trade := BacktestTrade{
                ID:           pos.ID,
                Side:         pos.Side,
                EntryPrice:   pos.EntryPrice,
                ExitPrice:    exitPrice,
                EntryTime:    pos.EntryTime,
                ExitTime:     0, // Filled from candle if available
                SizeUSD:      pos.SizeUSD,
                PnL:          math.Round(pnlUSD*10000) / 10000,
                PnLPct:       math.Round(pnlPct*10000) / 10000,
                Fees:         math.Round(fees*10000) / 10000,
                NetPnL:       math.Round(netPnL*10000) / 10000,
                DurationBars: exitIdx - pos.EntryIdx,
                ExitReason:   reason,
        }
        be.closedTrades = append(be.closedTrades, trade)

        // Update balance
        margin := pos.SizeUSD / float64(pos.Leverage)
        be.balance += margin + netPnL
        be.totalPnL += netPnL
        be.totalFees += fees
        if netPnL >= 0 {
                be.wins++
        } else {
                be.losses++
        }
}

func (be *BacktestEngine) computeEquity(currentPrice float64) float64 {
        equity := be.balance
        for _, pos := range be.positions {
                var unrealized float64
                if pos.Side == "LONG" {
                        unrealized = (currentPrice - pos.EntryPrice) / pos.EntryPrice * pos.SizeUSD * float64(pos.Leverage)
                } else {
                        unrealized = (pos.EntryPrice - currentPrice) / pos.EntryPrice * pos.SizeUSD * float64(pos.Leverage)
                }
                equity += pos.SizeUSD / float64(pos.Leverage) + unrealized
        }
        return equity
}

func (be *BacktestEngine) winRate() float64 {
        total := be.wins + be.losses
        if total == 0 {
                return 0
        }
        return float64(be.wins) / float64(total)
}

func (be *BacktestEngine) buildResult() map[string]interface{} {
        totalTrades := be.wins + be.losses
        winRate := be.winRate() * 100

        // Compute Sharpe Ratio (annualized)
        sharpeRatio := 0.0
        if len(be.closedTrades) > 1 {
                var sum, sumSq float64
                for _, t := range be.closedTrades {
                        ret := t.PnLPct / 100
                        sum += ret
                        sumSq += ret * ret
                }
                n := float64(len(be.closedTrades))
                mean := sum / n
                variance := sumSq/n - mean*mean
                if variance > 0 {
                        // Assume ~8760 hourly periods per year for 1h candles
                        sharpeRatio = mean / math.Sqrt(variance) * math.Sqrt(8760)
                }
        }

        // Compute Profit Factor
        profitFactor := 0.0
        var grossProfit, grossLoss float64
        for _, t := range be.closedTrades {
                if t.NetPnL >= 0 {
                        grossProfit += t.NetPnL
                } else {
                        grossLoss += -t.NetPnL
                }
        }
        if grossLoss > 0 {
                profitFactor = grossProfit / grossLoss
        } else if grossProfit > 0 {
                profitFactor = 999.99 // All wins, no losses
        }

        // Average trade stats
        avgPnL := 0.0
        bestTrade := 0.0
        worstTrade := 0.0
        avgDuration := 0.0
        if totalTrades > 0 {
                avgPnL = be.totalPnL / float64(totalTrades)
                for _, t := range be.closedTrades {
                        if t.NetPnL > bestTrade {
                                bestTrade = t.NetPnL
                        }
                        if t.NetPnL < worstTrade {
                                worstTrade = t.NetPnL
                        }
                        avgDuration += float64(t.DurationBars)
                }
                avgDuration /= float64(totalTrades)
        }

        // Duration in hours (assuming 1h candles)
        durationHours := float64(be.snapshotsUsed)
        if be.cfg.BacktestCandleInterval == "5m" {
                durationHours = float64(be.snapshotsUsed) / 12.0
        } else if be.cfg.BacktestCandleInterval == "15m" {
                durationHours = float64(be.snapshotsUsed) / 4.0
        } else if be.cfg.BacktestCandleInterval == "4h" {
                durationHours = float64(be.snapshotsUsed) * 4.0
        } else if be.cfg.BacktestCandleInterval == "1d" {
                durationHours = float64(be.snapshotsUsed) * 24.0
        }

        // Equity curve — downsample to max 200 points for frontend
        curve := be.equityCurve
        if len(curve) > 200 {
                step := float64(len(curve)) / 200.0
                sampled := make([]float64, 0, 200)
                for i := 0.0; i < float64(len(curve)); i += step {
                        idx := int(i)
                        if idx >= len(curve) {
                                idx = len(curve) - 1
                        }
                        sampled = append(sampled, curve[idx])
                }
                curve = sampled
        }

        // Last N trades for display (most recent 20)
        recentTrades := be.closedTrades
        if len(recentTrades) > 20 {
                recentTrades = recentTrades[len(recentTrades)-20:]
        }

        // Return of buy-and-hold for comparison
        buyHoldReturn := 0.0
        if len(be.candles) > 0 && be.candles[0].Close > 0 {
                firstPrice := be.candles[0].Close
                lastPrice := be.candles[len(be.candles)-1].Close
                buyHoldReturn = (lastPrice - firstPrice) / firstPrice * 100
        }

        // Strategy return
        strategyReturn := 0.0
        if be.initBalance > 0 {
                strategyReturn = (be.balance - be.initBalance) / be.initBalance * 100
        }

        return map[string]interface{}{
                "totalTrades":      totalTrades,
                "winRate":          math.Round(winRate*10) / 10,
                "totalPnl":         math.Round(be.totalPnL*10000) / 10000,
                "totalFees":        math.Round(be.totalFees*10000) / 10000,
                "wins":             be.wins,
                "losses":           be.losses,
                "maxDrawdown":      math.Round(be.maxDrawdown*100) / 100,
                "equityCurve":      curve,
                "sharpeRatio":      math.Round(sharpeRatio*100) / 100,
                "profitFactor":     math.Round(profitFactor*100) / 100,
                "avgTradePnl":      math.Round(avgPnL*10000) / 10000,
                "bestTrade":        math.Round(bestTrade*10000) / 10000,
                "worstTrade":       math.Round(worstTrade*10000) / 10000,
                "avgDurationBars":  math.Round(avgDuration*10) / 10,
                "durationHours":    math.Round(durationHours*10) / 10,
                "snapshotsUsed":    be.snapshotsUsed,
                "candleInterval":   be.cfg.BacktestCandleInterval,
                "candleCount":      len(be.candles),
                "initBalance":      be.initBalance,
                "finalBalance":     math.Round(be.balance*100) / 100,
                "strategyReturn":   math.Round(strategyReturn*100) / 100,
                "buyHoldReturn":    math.Round(buyHoldReturn*100) / 100,
                "recentTrades":     recentTrades,
                "grossProfit":      math.Round(grossProfit*10000) / 10000,
                "grossLoss":        math.Round(grossLoss*10000) / 10000,
                "dataSource":       be.dataSource,
        }
}

// RunTriggerBT runs a backtest using DCA Hurst+BB trigger strategy.
// LONG DCA:
//   Entry 1: Price crosses below lower BB → base size (1×)
//   Entry 2: Hurst crosses UP through 0.0 (while LONG open) → 2× base
//   Entry 3: Hurst crosses UP through 0.0 again → 4× base
//   Exit ALL: Hurst crosses DOWN through 1.0 → close all LONGs
// SHORT DCA (symmetric):
//   Entry 1: Price crosses above upper BB → base size (1×)
//   Entry 2: Hurst crosses DOWN through 1.0 (while SHORT open) → 2× base
//   Entry 3: Hurst crosses DOWN through 1.0 again → 4× base
//   Exit ALL: Hurst crosses UP through 0.0 → close all SHORTs
// SL/TP also close individual positions.
func (be *BacktestEngine) RunTriggerBT() map[string]interface{} {
        if len(be.candles) < 200 {
                return map[string]interface{}{"error": fmt.Sprintf("Za mało danych: %d świec (min 200)", len(be.candles))}
        }

        // Reset state
        be.positions = nil
        be.closedTrades = nil
        be.balance = be.initBalance
        be.totalPnL = 0
        be.totalFees = 0
        be.wins = 0
        be.losses = 0
        be.peakEquity = be.initBalance
        be.maxDrawdown = 0
        be.equityCurve = []float64{be.initBalance}
        be.nextID = 1
        be.closeWindow = nil
        be.emaFast = nil
        be.emaSlow = nil
        be.volumeHistory = nil
        be.running = true
        be.progressPct = 0
        be.dcaActive = false
        be.dcaDirection = ""
        be.dcaEntries = 0
        be.dcaBaseSize = 0

        totalBars := len(be.candles)

        // Build full close/high/low arrays for indicator computation
        allCloses := make([]float64, totalBars)
        allHighs := make([]float64, totalBars)
        allLows := make([]float64, totalBars)
        for i, c := range be.candles {
                allCloses[i] = c.Close
                allHighs[i] = c.High
                allLows[i] = c.Low
        }

        // Compute indicators on full dataset
        bbUpper, _, bbLower := calcBollinger(allCloses, 20, 2.0)
        hurstFast, _ := calcHCCCO(allCloses, allHighs, allLows, 10, 30, 1.0, 3.0)

        // hurstFast has warmup removed (mcl=15 bars skipped), so align indices
        hurstOffset := 15 // mcl = mcl_t/2 = 30/2 = 15
        // BB starts at index 19 (period-1)

        // Minimum index where both indicators are valid
        minIdx := 20 // BB needs 20 bars
        if hurstOffset > minIdx {
                minIdx = hurstOffset
        }

        logMsg("INFO", "TriggerBT DCA: Uruchamianie na %d świecach (Hurst+BB DCA)...", totalBars)

        lastProgressEmit := 0

        for i := minIdx; i < totalBars; i++ {
                if !be.running {
                        break
                }

                be.progressPct = float64(i) / float64(totalBars) * 100
                pct10 := int(be.progressPct / 10)
                if pct10 > lastProgressEmit {
                        lastProgressEmit = pct10
                        emitJSON("BACKTEST_JSON:", map[string]interface{}{
                                "status":      "running",
                                "candleCount": i + 1,
                                "interval":    be.cfg.BacktestCandleInterval,
                                "progressPct": math.Round(be.progressPct),
                        })
                }

                candle := be.candles[i]

                // Get indicator values at this candle
                bbIdx := i - 19 // BB array starts at index 19
                if bbIdx < 0 || bbIdx >= len(bbUpper) || bbIdx >= len(bbLower) {
                        continue
                }
                bbUp := bbUpper[bbIdx]
                bbLo := bbLower[bbIdx]

                hurstIdx := i - hurstOffset
                if hurstIdx < 1 || hurstIdx >= len(hurstFast) {
                        continue
                }
                hCurr := hurstFast[hurstIdx]
                hPrev := hurstFast[hurstIdx-1]

                // Detect Hurst crosses
                hurstCrossUp := hPrev <= 0.0 && hCurr > 0.0
                hurstCrossDown := hPrev >= 1.0 && hCurr < 1.0

                // Detect BB breaches (current candle crosses the band)
                bbCrossLower := false
                bbCrossUpper := false
                if i > 0 {
                        prevClose := be.candles[i-1].Close
                        bbIdxPrev := i - 1 - 19
                        if bbIdxPrev >= 0 && bbIdxPrev < len(bbLower) && bbIdxPrev < len(bbUpper) {
                                bbLoPrev := bbLower[bbIdxPrev]
                                bbUpPrev := bbUpper[bbIdxPrev]
                                bbCrossLower = prevClose >= bbLoPrev && candle.Close < bbLo
                                bbCrossUpper = prevClose <= bbUpPrev && candle.Close > bbUp
                        }
                }

                // ── DCA EXIT: Hurst cross closes ALL same-direction positions ──
                if be.dcaActive {
                        shouldExitAll := false
                        exitReason := ""
                        if be.dcaDirection == "LONG" && hurstCrossDown {
                                shouldExitAll = true
                                exitReason = "Hurst↓1.0 DCA exit"
                        }
                        if be.dcaDirection == "SHORT" && hurstCrossUp {
                                shouldExitAll = true
                                exitReason = "Hurst↑0.0 DCA exit"
                        }

                        if shouldExitAll {
                                exitDir := be.dcaDirection
                                var remaining []*BacktestPosition
                                for _, pos := range be.positions {
                                        if pos.Side == exitDir {
                                                be.closePosition(pos, candle.Close, i, exitReason)
                                        } else {
                                                remaining = append(remaining, pos)
                                        }
                                }
                                be.positions = remaining
                                be.dcaActive = false
                                be.dcaDirection = ""
                                be.dcaEntries = 0
                                be.dcaBaseSize = 0
                                logMsg("INFO", "TriggerBT DCA: EXIT ALL — %s @ $%.2f (%s)", exitDir, candle.Close, exitReason)
                        }
                }

                // ── DCA ENTRY 2/3: Hurst cross adds to existing position ──
                if be.dcaActive && be.dcaEntries < 3 {
                        shouldAdd := false
                        direction := be.dcaDirection
                        if direction == "LONG" && hurstCrossUp {
                                shouldAdd = true
                        }
                        if direction == "SHORT" && hurstCrossDown {
                                shouldAdd = true
                        }

                        if shouldAdd {
                                nextEntry := be.dcaEntries + 1
                                multiplier := 1.0
                                if nextEntry == 2 { multiplier = 2.0 }
                                if nextEntry == 3 { multiplier = 4.0 }
                                sizeUSD := be.dcaBaseSize * multiplier

                                slPct := be.cfg.BacktestSLPct
                                tpPct := be.cfg.BacktestTPPct
                                if slPct <= 0 { slPct = be.cfg.StopLossPct }
                                if tpPct <= 0 { tpPct = be.cfg.TakeProfitPct }

                                var sl, tp float64
                                if direction == "LONG" {
                                        sl = candle.Close * (1 - slPct/100)
                                        tp = candle.Close * (1 + tpPct/100)
                                } else {
                                        sl = candle.Close * (1 + slPct/100)
                                        tp = candle.Close * (1 - tpPct/100)
                                }

                                pos := &BacktestPosition{
                                        ID: be.nextID, Side: direction,
                                        EntryPrice: candle.Close, EntryIdx: i,
                                        EntryTime: candle.OpenTime, SizeUSD: sizeUSD,
                                        StopLoss: sl, TakeProfit: tp,
                                        Leverage: be.cfg.Leverage,
                                        DCAEntry: nextEntry, DCAMult: multiplier,
                                }
                                be.nextID++
                                be.positions = append(be.positions, pos)
                                margin := pos.SizeUSD / float64(pos.Leverage)
                                be.balance -= margin
                                be.dcaEntries = nextEntry

                                hurstLabel := "Hurst↑0.0"
                                if direction == "SHORT" { hurstLabel = "Hurst↓1.0" }
                                logMsg("INFO", "TriggerBT DCA: ENTRY %d %s $%.2f (%.0fx) @ $%.2f (%s)", nextEntry, direction, sizeUSD, multiplier, candle.Close, hurstLabel)
                        }
                }

                // ── DCA ENTRY 1: BB cross starts new DCA group ──
                if !be.dcaActive {
                        if bbCrossLower || bbCrossUpper {
                                direction := "LONG"
                                if bbCrossUpper { direction = "SHORT" }

                                baseSize := be.cfg.OrderSizeUSD * float64(be.cfg.Leverage) // include leverage
                                slPct := be.cfg.BacktestSLPct
                                tpPct := be.cfg.BacktestTPPct
                                if slPct <= 0 { slPct = be.cfg.StopLossPct }
                                if tpPct <= 0 { tpPct = be.cfg.TakeProfitPct }

                                var sl, tp float64
                                if direction == "LONG" {
                                        sl = candle.Close * (1 - slPct/100)
                                        tp = candle.Close * (1 + tpPct/100)
                                } else {
                                        sl = candle.Close * (1 + slPct/100)
                                        tp = candle.Close * (1 - tpPct/100)
                                }

                                pos := &BacktestPosition{
                                        ID: be.nextID, Side: direction,
                                        EntryPrice: candle.Close, EntryIdx: i,
                                        EntryTime: candle.OpenTime, SizeUSD: baseSize,
                                        StopLoss: sl, TakeProfit: tp,
                                        Leverage: be.cfg.Leverage,
                                        DCAEntry: 1, DCAMult: 1.0,
                                }
                                be.nextID++
                                be.positions = append(be.positions, pos)
                                margin := pos.SizeUSD / float64(pos.Leverage)
                                be.balance -= margin

                                be.dcaActive = true
                                be.dcaDirection = direction
                                be.dcaEntries = 1
                                be.dcaBaseSize = baseSize

                                bbLabel := "BB<lower"
                                if bbCrossUpper { bbLabel = "BB>upper" }
                                logMsg("INFO", "TriggerBT DCA: ENTRY 1 %s $%.2f (1x) @ $%.2f (%s)", direction, baseSize, candle.Close, bbLabel)
                        }
                }

                // ── Check individual SL/TP exits ──
                var remaining []*BacktestPosition
                for _, pos := range be.positions {
                        shouldClose := false
                        exitReason := ""
                        exitPx := candle.Close

                        if pos.Side == "LONG" {
                                if candle.Low <= pos.StopLoss {
                                        shouldClose = true
                                        exitReason = "stop loss"
                                        exitPx = pos.StopLoss
                                } else if candle.High >= pos.TakeProfit {
                                        shouldClose = true
                                        exitReason = "take profit"
                                        exitPx = pos.TakeProfit
                                }
                        } else {
                                if candle.High >= pos.StopLoss {
                                        shouldClose = true
                                        exitReason = "stop loss"
                                        exitPx = pos.StopLoss
                                } else if candle.Low <= pos.TakeProfit {
                                        shouldClose = true
                                        exitReason = "take profit"
                                        exitPx = pos.TakeProfit
                                }
                        }

                        // Max duration timeout (200 bars)
                        if !shouldClose && i-pos.EntryIdx > 200 {
                                shouldClose = true
                                exitReason = "timeout"
                        }

                        if shouldClose {
                                be.closePosition(pos, exitPx, i, exitReason)
                        } else {
                                remaining = append(remaining, pos)
                        }
                }
                be.positions = remaining

                // Check if DCA group lost all positions to SL/TP — reset DCA
                if be.dcaActive {
                        hasOpen := false
                        for _, pos := range be.positions {
                                if pos.Side == be.dcaDirection {
                                        hasOpen = true
                                        break
                                }
                        }
                        if !hasOpen {
                                be.dcaActive = false
                                be.dcaDirection = ""
                                be.dcaEntries = 0
                                be.dcaBaseSize = 0
                        }
                }

                // Record equity every 10 bars
                if i%10 == 0 {
                        equity := be.computeEquity(candle.Close)
                        be.equityCurve = append(be.equityCurve, math.Round(equity*100)/100)
                        if equity > be.peakEquity {
                                be.peakEquity = equity
                        }
                        if be.peakEquity > 0 {
                                dd := (be.peakEquity - equity) / be.peakEquity * 100
                                if dd > be.maxDrawdown {
                                        be.maxDrawdown = dd
                                }
                        }
                }
        }

        // Close remaining
        lastPrice := be.candles[len(be.candles)-1].Close
        for _, pos := range be.positions {
                be.closePosition(pos, lastPrice, len(be.candles)-1, "backtest end")
        }
        be.positions = nil

        finalEquity := be.balance
        be.equityCurve = append(be.equityCurve, math.Round(finalEquity*100)/100)

        be.running = false
        be.progressPct = 100
        be.snapshotsUsed = totalBars

        logMsg("INFO", "TriggerBT DCA: Zakończono — %d trade'ów, WR %.1f%%, PnL $%.2f",
                be.wins+be.losses, be.winRate()*100, be.totalPnL)

        result := be.buildResult()
        result["strategy"] = "Hurst+BB DCA"
        result["entryLogic"] = "E1=BB cross | E2=Hurst cross (2x) | E3=Hurst cross (4x)"
        result["exitLogic"] = "Hurst opposite cross → close ALL | SL/TP per position"
        return result
}

// ─── Scalping Backtester ────────────────────────────────────────────────────

type ScalpingBacktester struct {
        engine *ScalpingEngine
}

func NewScalpingBacktester() *ScalpingBacktester {
        return &ScalpingBacktester{
                engine: NewScalpingEngine(),
        }
}

func (sb *ScalpingBacktester) Run(snapshots []*MarketSnapshot) map[string]interface{} {
        if len(snapshots) < 20 {
                return map[string]interface{}{"error": "Za mało danych (min 20 snapshotów)"}
        }

        sb.engine = NewScalpingEngine()

        for _, snap := range snapshots {
                if snap.Price <= 0 {
                        continue
                }

                signals := sb.engine.CheckEntrySignals(snap)
                decision := sb.engine.AggregateSignals(signals)

                if decision != nil {
                        existingDirs := make(map[string]bool)
                        for _, p := range sb.engine.Positions {
                                existingDirs[p.Side] = true
                        }
                        if !existingDirs[decision.Direction] {
                                sb.engine.OpenPosition(decision.Direction, snap.Price, strings.Join(decision.Reasons, "; "))
                        }
                }

                sb.engine.CheckExits(snap.Price)
        }

        totalTrades := sb.engine.wins + sb.engine.losses
        winRate := 0.0
        if totalTrades > 0 {
                winRate = float64(sb.engine.wins) / float64(totalTrades) * 100
        }

        avgPnL := 0.0
        bestTrade := 0.0
        worstTrade := 0.0
        avgDuration := 0.0
        if totalTrades > 0 {
                avgPnL = sb.engine.totalPnL / float64(totalTrades)
                for _, t := range sb.engine.ClosedTrades {
                        if t.NetPnL > bestTrade {
                                bestTrade = t.NetPnL
                        }
                        if t.NetPnL < worstTrade {
                                worstTrade = t.NetPnL
                        }
                        avgDuration += t.DurationSec
                }
                if len(sb.engine.ClosedTrades) > 0 {
                        avgDuration /= float64(len(sb.engine.ClosedTrades))
                }
        }

        curve := sb.engine.equityCurve
        if len(curve) > 120 {
                curve = curve[len(curve)-120:]
        }

        return map[string]interface{}{
                "totalTrades":    totalTrades,
                "winRate":        math.Round(winRate*10) / 10,
                "totalPnl":       math.Round(sb.engine.totalPnL*10000) / 10000,
                "totalFees":      math.Round(sb.engine.totalFees*10000) / 10000,
                "wins":           sb.engine.wins,
                "losses":         sb.engine.losses,
                "maxDrawdown":    math.Round(sb.engine.maxDrawdown*100) / 100,
                "equityCurve":    curve,
                "avgPnlPerTrade": math.Round(avgPnL*10000) / 10000,
                "bestTrade":      math.Round(bestTrade*10000) / 10000,
                "worstTrade":     math.Round(worstTrade*10000) / 10000,
                "avgDurationSec": math.Round(avgDuration*10) / 10,
                "snapshotsUsed":  len(snapshots),
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AGENT
// ═══════════════════════════════════════════════════════════════════════════════

type Agent struct {
        cfg          *Config
        hl           *HLClient
        analyzer     *SignalAnalyzer
        sentiment    *SentimentEngine
        enhanced     *EnhancedSentimentEngine
        onchain      *OnChainAnalyzer
        signalRanking *SignalRankingAnalyzer
        paper        *PaperTrader
        cb           *CircuitBreaker
        regime       *RegimeDetector
        risk         *RiskEngine
        scalp        *ScalpingEngine
        scalpBT      *ScalpingBacktester
        btEngine     *BacktestEngine
        iteration    int
        candleCache  []Candle
        candleTime   time.Time
        snapHistory  []*MarketSnapshot
        lastAICall   time.Time
        cachedAIDecision *AIDecision
        // Trigger state — received from frontend (client-side MTF analysis)
        triggerState TriggerState
        triggerMu    sync.Mutex
        // DCA group — tracks multi-entry positions for Hurst+BB strategy
        dcaGroup DCAGroup
        // WebSocket hub for standalone desktop mode (nil = stdout mode)
        hub          *WSHub
        // HYP-004: paused flag — when true, runIteration() is skipped.
        // Set by START/STOP UI buttons via WS message {"type":"START"} / {"type":"STOP"}.
        // Default: false (auto-running on app launch, like before).
        paused       bool
        pausedMu     sync.RWMutex
}

// TriggerState holds the latest trigger signals from the frontend
// Hurst cross + BB breach = primary entry signals for paper trading
type TriggerState struct {
        HurstCrossUp   bool    `json:"hurstCrossUp"`    // Hurst crossed UP through 0.0 (BUY)
        HurstCrossDown bool    `json:"hurstCrossDown"`  // Hurst crossed DOWN through 1.0 (SHORT)
        BBCrossLower   bool    `json:"bbCrossLower"`    // Price crossed below lower BB (BUY)
        BBCrossUpper   bool    `json:"bbCrossUpper"`    // Price crossed above upper BB (SHORT)
        Timeframe      string  `json:"timeframe"`       // Which timeframe triggered (e.g. "15m")
        Timestamp      int64   `json:"timestamp"`       // Unix ms when detected
}

// DCAGroup tracks a DCA (Dollar Cost Averaging) position group for the Hurst+BB strategy.
// LONG DCA:
//   Entry 1: Price crosses below lower BB → base size (1×)
//   Entry 2: Hurst crosses UP through 0.0 → 2× base
//   Entry 3: Hurst crosses UP through 0.0 again → 4× base
//   Exit ALL: Hurst crosses DOWN through 1.0 → close all LONGs
// SHORT DCA (symmetric):
//   Entry 1: Price crosses above upper BB → base size (1×)
//   Entry 2: Hurst crosses DOWN through 1.0 → 2× base
//   Entry 3: Hurst crosses DOWN through 1.0 again → 4× base
//   Exit ALL: Hurst crosses UP through 0.0 → close all SHORTs
type DCAGroup struct {
        Direction  string    // "LONG" or "SHORT"
        Entries    int       // number of entries made (1, 2, or 3)
        BaseSize   float64   // size of entry 1 (OrderSizeUSD * Leverage)
        Active     bool      // whether this group is still open
        PositionIDs []int    // indices into paper.Positions for tracking
}

func NewAgent(cfg *Config) *Agent {
        hl := NewHLClient(cfg)
        return &Agent{
                cfg:           cfg,
                hl:            hl,
                analyzer:      NewSignalAnalyzer(cfg),
                sentiment:     NewSentimentEngine(cfg, hl),
                enhanced:      NewEnhancedSentimentEngine(cfg),
                onchain:       NewOnChainAnalyzer(cfg),
                signalRanking: NewSignalRankingAnalyzer(cfg),
                paper:         NewPaperTrader(cfg),
                cb:            NewCircuitBreaker(cfg),
                regime:        NewRegimeDetector(cfg),
                risk:          NewRiskEngine(cfg),
                scalp:         NewScalpingEngine(),
                scalpBT:       NewScalpingBacktester(),
                btEngine:      NewBacktestEngine(cfg),
        }
}

func (a *Agent) Run(ctx context.Context) {
        logMsg("INFO", "🚀 HyperA v0.1 Go uruchamianie...")

        // Start stdin config reader
        go a.readStdinConfig()

        ticker := time.NewTicker(time.Duration(a.cfg.LoopIntervalSec) * time.Second)
        defer ticker.Stop()

        for {
                select {
                case <-ctx.Done():
                        logMsg("INFO", "⛔ HyperA zatrzymany")
                        return
                case <-ticker.C:
                        // HYP-004: respect paused flag.
                        // When user clicks STOP in UI, paused=true → runIteration is skipped,
                        // but the ticker keeps running so START can resume instantly.
                        a.pausedMu.RLock()
                        paused := a.paused
                        a.pausedMu.RUnlock()
                        if !paused {
                                a.runIteration()
                        }
                }
        }
}

// HYP-004: SetPaused toggles the agent's running state.
// Called from WS message handler when {"type":"START"} or {"type":"STOP"} arrives.
func (a *Agent) SetPaused(p bool) {
        a.pausedMu.Lock()
        a.paused = p
        a.pausedMu.Unlock()
        if p {
                logMsg("WARN", "⏸️  Agent PAUSED via UI STOP button — ticker still running, iterations skipped")
        } else {
                logMsg("INFO", "▶️  Agent RESUMED via UI START button — iterations resumed")
        }
}

// HYP-004: IsPaused reports whether the agent is currently paused.
// Used by emitState so the dashboard can show "paused" status.
func (a *Agent) IsPaused() bool {
        a.pausedMu.RLock()
        defer a.pausedMu.RUnlock()
        return a.paused
}

func (a *Agent) readStdinConfig() {
        scanner := bufio.NewScanner(os.Stdin)
        for scanner.Scan() {
                line := strings.TrimSpace(scanner.Text())
                if line == "" { continue }
                var update map[string]interface{}
                if err := json.Unmarshal([]byte(line), &update); err != nil { continue }
                if t, ok := update["type"].(string); ok {
                        if t == "CONFIG_UPDATE" {
                                a.cfg.ApplyStdinUpdate(update)
                                logMsg("INFO", "Config updated: $%.0f ×%d SL:%.1f%% TP:%.1f%% MinConf:%d%% ExitSLTP:%v HoldMin:%.1f",
                                        a.cfg.OrderSizeUSD, a.cfg.Leverage, a.cfg.StopLossPct, a.cfg.TakeProfitPct, a.cfg.MinConfidence,
                                        a.cfg.ExitOnlyOnSLTP, a.cfg.MinHoldMinutes)
                        } else if t == "RUN_BACKTEST" {
                                go a.runBacktest(update)
                        } else if t == "RESET_CB" {
                                a.cb.active = false
                                a.cb.reason = ""
                                a.cb.dailyStartBalance = a.paper.Balance
                                logMsg("INFO", "✅ Circuit Breaker ręcznie zresetowany")
                        } else if t == "START" {
                                // HYP-004: stdin bridge path (cloud/dev mode).
                                a.SetPaused(false)
                        } else if t == "STOP" {
                                // HYP-004: stdin bridge path (cloud/dev mode).
                                a.SetPaused(true)
                        } else if t == "TRIGGER_UPDATE" {
                                a.triggerMu.Lock()
                                if v, ok := update["hurstCrossUp"]; ok {
                                        if b, ok := v.(bool); ok { a.triggerState.HurstCrossUp = b }
                                }
                                if v, ok := update["hurstCrossDown"]; ok {
                                        if b, ok := v.(bool); ok { a.triggerState.HurstCrossDown = b }
                                }
                                if v, ok := update["bbCrossLower"]; ok {
                                        if b, ok := v.(bool); ok { a.triggerState.BBCrossLower = b }
                                }
                                if v, ok := update["bbCrossUpper"]; ok {
                                        if b, ok := v.(bool); ok { a.triggerState.BBCrossUpper = b }
                                }
                                if v, ok := update["timeframe"]; ok {
                                        if s, ok := v.(string); ok { a.triggerState.Timeframe = s }
                                }
                                a.triggerState.Timestamp = time.Now().UnixMilli()
                                ts := a.triggerState
                                a.triggerMu.Unlock()
                                logMsg("INFO", "🎯 Trigger update: H↑=%v H↓=%v BB<=%v BB>=%v TF=%s",
                                        ts.HurstCrossUp, ts.HurstCrossDown, ts.BBCrossLower, ts.BBCrossUpper, ts.Timeframe)
                        }
                }
        }
}

func (a *Agent) runBacktest(params map[string]interface{}) {
        // Apply any backtest-specific params
        if v, ok := params["candle_interval"]; ok {
                if s, ok := v.(string); ok { a.cfg.BacktestCandleInterval = s }
        }
        if v, ok := params["candle_limit"]; ok {
                if f, err := toFloat(v); err == nil { a.cfg.BacktestCandleLimit = int(f) }
        }
        if v, ok := params["sl_pct"]; ok {
                if f, err := toFloat(v); err == nil { a.cfg.BacktestSLPct = f }
        }
        if v, ok := params["tp_pct"]; ok {
                if f, err := toFloat(v); err == nil { a.cfg.BacktestTPPct = f }
        }
        if v, ok := params["init_balance"]; ok {
                if f, err := toFloat(v); err == nil { a.cfg.BacktestInitBalance = f }
        }

        // Data source: "binance" (default) or "hyperliquid"
        dataSource := "binance"
        if v, ok := params["data_source"]; ok {
                if s, ok := v.(string); ok && (s == "hyperliquid" || s == "binance") {
                        dataSource = s
                }
        }

        // Re-create engine with updated config
        a.btEngine = NewBacktestEngine(a.cfg)

        symbol := a.cfg.Coin + "USDT"
        interval := a.cfg.BacktestCandleInterval
        limit := a.cfg.BacktestCandleLimit
        if limit < 1000 { limit = 1500 }

        logMsg("INFO", "Backtest: Importowanie %d świec %s %s [%s]...", limit, symbol, interval, dataSource)

        // Emit progress
        emitJSON("BACKTEST_JSON:", map[string]interface{}{
                "status":     "importing",
                "symbol":     symbol,
                "interval":   interval,
                "limit":      limit,
                "dataSource": dataSource,
        })

        count, err := a.btEngine.ImportCandles(symbol, interval, limit, dataSource)
        if err != nil {
                logMsg("ERROR", "Backtest import error: %v", err)
                emitJSON("BACKTEST_JSON:", map[string]interface{}{
                        "status": "error",
                        "error":  err.Error(),
                })
                return
        }

        logMsg("INFO", "Backtest: Uruchamianie na %d świecach...", count)
        emitJSON("BACKTEST_JSON:", map[string]interface{}{
                "status":       "running",
                "candleCount":  count,
                "interval":     interval,
                "dataSource":   a.btEngine.dataSource,
        })

        // Check if trigger mode backtest is requested
        useTrigger := false
        if v, ok := params["trigger_mode"]; ok {
                if b, ok := v.(bool); ok { useTrigger = b }
        }
        // Also use trigger mode if trigger_mode_enabled is active in config
        if a.cfg.TriggerModeEnabled {
                useTrigger = true
        }

        var result map[string]interface{}
        if useTrigger {
                logMsg("INFO", "Backtest: TRIGGER MODE (Hurst+BB) na %d świecach...", count)
                result = a.btEngine.RunTriggerBT()
        } else {
                result = a.btEngine.Run()
        }

        // Add status field
        result["status"] = "completed"
        emitJSON("BACKTEST_JSON:", result)

        logMsg("INFO", "Backtest zakończony: %d trade'ów, WR %.1f%%, PnL $%.2f",
                result["totalTrades"], result["winRate"], result["totalPnl"])
}

func (a *Agent) runIteration() {
        a.iteration++
        snap := &MarketSnapshot{Iteration: a.iteration, Coin: a.cfg.Coin}

        // ── 1) Fetch market data ──
        a.fetchMarketData(snap)

        // ── 2) Fetch candles + compute indicators ──
        a.fetchIndicators(snap)

        // ── 3) Analyze signals ──
        sentiment := a.sentiment.GetSentiment()
        snap.SentimentScore = sentiment.Score
        snap.SentimentLabel = sentiment.Label
        snap.WhaleLongRatio = sentiment.LongRatio
        snap.WhaleTotalPositions = sentiment.TotalPositions
        snap.WhaleTotalValueUSD = sentiment.TotalValueUSD
        snap.WalletsLongCount = sentiment.WalletsLongCount
        snap.WalletsShortCount = sentiment.WalletsShortCount
        snap.WalletsNeutralCount = sentiment.WalletsNeutralCount

        signal, signalStates := a.analyzer.Analyze(snap, sentiment)

        // ── 3b) Update prev values AFTER Analyze() — must not set before, or deltas are zero ──
        a.analyzer.prevPrice = snap.Price
        a.analyzer.prevVolume = snap.Volume
        a.analyzer.prevBidDepth = snap.BidDepth
        a.analyzer.prevAskDepth = snap.AskDepth
        if snap.OpenInterest > 0 { a.analyzer.prevOI = snap.OpenInterest }

        // ── 4) Log status ──
        logMsg("INFO", "[#%d] %s $%.2f │ Vol: $%.0f │ Addr: %d │ Wieloryby: %d │ Signal: %s (%.0f%%)",
                a.iteration, a.cfg.Coin, snap.Price, snap.Volume, snap.ActiveAddresses, snap.WhaleCount,
                signal.Direction, signal.Confidence)

        logMsg("INFO", "Sygnał: %s │ Pewność: %.0f%% │ Powody: %s",
                signal.Direction, signal.Confidence, strings.Join(signal.Reasons, ", "))

        // ── 5) Emit JSON outputs ──
        emitJSON("MARKET_JSON:", snap)
        emitJSON("SIGNAL_JSON:", signalStates)
        emitJSON("TOP_TRADERS_JSON:", map[string]interface{}{
                "type":          "TOP_TRADERS",
                "long_count":    sentiment.WalletsLongCount,
                "short_count":   sentiment.WalletsShortCount,
                "neutral_count": sentiment.WalletsNeutralCount,
                "long_ratio":    sentiment.LongRatio,
                "score":         sentiment.Score,
                "label":         sentiment.Label,
                "traders":       sentiment.TraderProfiles,
        })

        // v0.1 modules — cache regime result to avoid double-calling Detect()
        regimeResult := a.regime.Detect(snap)
        emitJSON("REGIME_JSON:", regimeResult)
        emitJSON("CB_JSON:", a.cb.Check(a.paper.Balance, a.paper.Trades))
        emitJSON("RISK_JSON:", a.risk.Calculate(snap, a.paper.Balance))

        if a.cfg.SentimentV2Enabled {
                emitJSON("SENTIMENT_V2_JSON:", a.enhanced.Fetch())
        }

        // On-chain analytics
        emitJSON("ONCHAIN_JSON:", a.onchain.Fetch())

        // Signal Ranking — top crypto by volume with per-coin signals
        if a.cfg.SignalRankingEnabled {
                emitJSON("SIGNAL_RANKING_JSON:", a.signalRanking.Fetch())
        }

        // ── 5a) AI Decision Engine ──
        if a.cfg.AIEngineEnabled && a.cfg.AIAPIKey != "" {
                aiDecision := a.fetchAIDecision(snap, signal, regimeResult)
                if aiDecision != nil {
                        emitJSON("AI_DECISION_JSON:", aiDecision)
                        logMsg("INFO", "AI Decision: %s (%.0f%%) — %s", aiDecision.Direction, aiDecision.Confidence, aiDecision.Strategy)
                }
        }

        // ── 5b) Scalping Engine ──
        func() {
                defer func() {
                        if r := recover(); r != nil {
                                logMsg("ERROR", "ScalpingEngine panic: %v", r)
                        }
                }()

                // Update regime — use cached result from above
                if regimeResult != nil {
                        a.scalp.SetRegime(regimeResult.Regime)
                }

                // Check entry signals
                scalpSignals := a.scalp.CheckEntrySignals(snap)
                decision := a.scalp.AggregateSignals(scalpSignals)

                if decision != nil {
                        existingDirs := make(map[string]bool)
                        for _, p := range a.scalp.Positions {
                                existingDirs[p.Side] = true
                        }
                        if !existingDirs[decision.Direction] {
                                a.scalp.OpenPosition(decision.Direction, snap.Price, strings.Join(decision.Reasons, "; "))
                        }
                }

                // Check exits
                a.scalp.CheckExits(snap.Price)

                // Emit SCALP_JSON
                emitJSON("SCALP_JSON:", a.scalp.GetStatus())

                // Store snapshot for backtesting
                a.snapHistory = append(a.snapHistory, snap)
                if len(a.snapHistory) > 500 {
                        a.snapHistory = a.snapHistory[len(a.snapHistory)-500:]
                }

                // Run backtest every 50 iterations
                if a.iteration > 0 && a.iteration%50 == 0 && len(a.snapHistory) >= 20 {
                        btResult := a.scalpBT.Run(a.snapHistory)
                        emitJSON("SCALP_BACKTEST_JSON:", btResult)
                }
        }()

        // ── 6) Paper trading ──
        a.paper.CheckSLTP(snap.Price)
        // Circuit Breaker check — block trading if active
        if !a.cb.active {
                if a.cfg.TriggerModeEnabled {
                        // ═══ DCA STRATEGY (Hurst+BB) — LONG + SHORT ═══
                        // LONG:
                        //   Entry 1: Price crosses below lower BB → base size (1×)
                        //   Entry 2: Hurst crosses UP through 0.0 (while LONG open) → 2× base
                        //   Entry 3: Hurst crosses UP through 0.0 again → 4× base
                        //   Exit ALL: Hurst crosses DOWN through 1.0 → close all LONGs
                        // SHORT:
                        //   Entry 1: Price crosses above upper BB → base size (1×)
                        //   Entry 2: Hurst crosses DOWN through 1.0 (while SHORT open) → 2× base
                        //   Entry 3: Hurst crosses DOWN through 1.0 again → 4× base
                        //   Exit ALL: Hurst crosses UP through 0.0 → close all SHORTs
                        a.triggerMu.Lock()
                        ts := a.triggerState
                        a.triggerMu.Unlock()

                        baseSizeUSD := a.cfg.OrderSizeUSD * float64(a.cfg.Leverage) // include leverage in base size

                        // ── Check DCA EXIT first ──
                        // LONG exit: Hurst crosses DOWN through 1.0
                        if a.dcaGroup.Active && a.dcaGroup.Direction == "LONG" && ts.HurstCrossDown {
                                closed := a.paper.CloseAllBySide("LONG", snap.Price, "Hurst↓1.0 exit (DCA)")
                                if closed > 0 {
                                        logMsg("INFO", "🎯 DCA EXIT: Closed %d LONG(s) — Hurst↓1.0 on %s", closed, ts.Timeframe)
                                        a.dcaGroup = DCAGroup{} // Reset DCA group
                                }
                        }
                        // SHORT exit: Hurst crosses UP through 0.0
                        if a.dcaGroup.Active && a.dcaGroup.Direction == "SHORT" && ts.HurstCrossUp {
                                closed := a.paper.CloseAllBySide("SHORT", snap.Price, "Hurst↑0.0 exit (DCA)")
                                if closed > 0 {
                                        logMsg("INFO", "🎯 DCA EXIT: Closed %d SHORT(s) — Hurst↑0.0 on %s", closed, ts.Timeframe)
                                        a.dcaGroup = DCAGroup{} // Reset DCA group
                                }
                        }

                        // ── Check DCA ENTRY 2 or 3 (Hurst cross while DCA group active) ──
                        if a.dcaGroup.Active && a.dcaGroup.Entries < 3 {
                                // LONG Entry 2/3: Hurst crosses UP through 0.0 while we have a LONG DCA group
                                if a.dcaGroup.Direction == "LONG" && ts.HurstCrossUp {
                                        nextEntry := a.dcaGroup.Entries + 1
                                        multiplier := 1.0
                                        if nextEntry == 2 { multiplier = 2.0 }
                                        if nextEntry == 3 { multiplier = 4.0 }
                                        sizeUSD := a.dcaGroup.BaseSize * multiplier
                                        a.paper.OpenDCAPosition("LONG", snap.Price, sizeUSD)
                                        a.dcaGroup.Entries = nextEntry
                                        logMsg("INFO", "🎯 DCA ENTRY %d: LONG $%.2f (%.0fx) — Hurst↑0.0 on %s", nextEntry, sizeUSD, multiplier, ts.Timeframe)
                                }
                                // SHORT Entry 2/3: Hurst crosses DOWN through 1.0 while we have a SHORT DCA group
                                if a.dcaGroup.Direction == "SHORT" && ts.HurstCrossDown {
                                        nextEntry := a.dcaGroup.Entries + 1
                                        multiplier := 1.0
                                        if nextEntry == 2 { multiplier = 2.0 }
                                        if nextEntry == 3 { multiplier = 4.0 }
                                        sizeUSD := a.dcaGroup.BaseSize * multiplier
                                        a.paper.OpenDCAPosition("SHORT", snap.Price, sizeUSD)
                                        a.dcaGroup.Entries = nextEntry
                                        logMsg("INFO", "🎯 DCA ENTRY %d: SHORT $%.2f (%.0fx) — Hurst↓1.0 on %s", nextEntry, sizeUSD, multiplier, ts.Timeframe)
                                }
                        }

                        // ── Check DCA ENTRY 1 (BB cross — start new DCA group) ──
                        // Only start a new group if no active DCA group exists
                        if !a.dcaGroup.Active {
                                // LONG Entry 1: Price crosses below lower BB
                                if ts.BBCrossLower {
                                        sizeUSD := baseSizeUSD // base size with leverage (1×)
                                        a.paper.OpenDCAPosition("LONG", snap.Price, sizeUSD)
                                        a.dcaGroup = DCAGroup{
                                                Direction: "LONG",
                                                Entries:   1,
                                                BaseSize:  baseSizeUSD,
                                                Active:    true,
                                        }
                                        logMsg("INFO", "🎯 DCA ENTRY 1: LONG $%.2f (1x) — BB<lower on %s", sizeUSD, ts.Timeframe)
                                }
                                // SHORT Entry 1: Price crosses above upper BB
                                if ts.BBCrossUpper {
                                        sizeUSD := baseSizeUSD // base size with leverage (1×)
                                        a.paper.OpenDCAPosition("SHORT", snap.Price, sizeUSD)
                                        a.dcaGroup = DCAGroup{
                                                Direction: "SHORT",
                                                Entries:   1,
                                                BaseSize:  baseSizeUSD,
                                                Active:    true,
                                        }
                                        logMsg("INFO", "🎯 DCA ENTRY 1: SHORT $%.2f (1x) — BB>upper on %s", sizeUSD, ts.Timeframe)
                                }
                        }

                        // ALWAYS consume triggers after processing (prevents stale triggers)
                        a.triggerMu.Lock()
                        a.triggerState = TriggerState{}
                        a.triggerMu.Unlock()

                        // Check if DCA group positions were all closed by SL/TP — reset group if so
                        if a.dcaGroup.Active {
                                hasOpen := false
                                for _, pos := range a.paper.Positions {
                                        if pos.Side == a.dcaGroup.Direction {
                                                hasOpen = true
                                                break
                                        }
                                }
                                if !hasOpen {
                                        logMsg("INFO", "🎯 DCA group reset — no open %s positions left (SL/TP closed)", a.dcaGroup.Direction)
                                        a.dcaGroup = DCAGroup{}
                                }
                        }
                } else {
                        // LEGACY MODE: use SignalAnalyzer output
                        a.paper.ProcessSignal(signal, snap.Price)
                }
        } else {
                logMsg("WARN", "⏸ Paper trading zablokowany przez Circuit Breaker")
        }
        emitJSON("PAPER_JSON:", a.paper.GetStatus(snap.Price))
}

// ── AI Decision Engine ──────────────────────────────────────────────────────────
// Calls OpenAI-compatible LLM with market snapshot and asks for trading decision.
// Rate-limited to AIRefreshSec (default 60s) to avoid excessive API costs.

func (a *Agent) fetchAIDecision(snap *MarketSnapshot, signal *Signal, regime *MarketRegime) *AIDecision {
        // Rate limit
        if a.lastAICall.IsZero() == false && time.Since(a.lastAICall) < time.Duration(a.cfg.AIRefreshSec)*time.Second {
                return a.cachedAIDecision
        }

        if a.cfg.AIAPIKey == "" {
                return nil
        }

        // Build prompt with market context
        prompt := fmt.Sprintf(`You are a professional crypto trading analyst. Analyze the following market data and provide a trading decision.

MARKET DATA:
- Coin: %s
- Price: $%.2f
- 24h Volume: $%.0f
- Mark Price: $%.2f
- Funding Rate: %.6f (%.4f%% annualized)
- Open Interest: %.0f BTC
- OI Change: %.2f%%
- Bid Depth: $%.0f | Ask Depth: $%.0f
- OB Imbalance: %.2f:1
- OB Wall: $%.0f (%s)

TECHNICAL INDICATORS:
- RSI(14): %.1f
- MACD: %.4f / Signal: %.4f / Histogram: %.4f
- Bollinger: Upper %.2f / Mid %.2f / Lower %.2f / BW %.2f%%
- Volatility: %s (%.2f%%)
- Perp Premium: %.4f%% (%s)
- Price Z-Score: %.2f (%s)

SIGNAL ANALYSIS:
- Direction: %s
- Confidence: %.0f%%
- Reasons: %s
- Market Regime: %s

Respond in JSON format only:
{
  "direction": "LONG" | "SHORT" | "NEUTRAL",
  "confidence": 0-100,
  "reasoning": "brief explanation",
  "strategy": "SCALP" | "SWING" | "HOLD",
  "risk_assessment": "LOW" | "MEDIUM" | "HIGH",
  "key_factors": ["factor1", "factor2", "factor3"]
}`,
                snap.Coin, snap.Price, snap.Volume,
                snap.MarkPx, snap.FundingRate, snap.FundingRate*3*365*100,
                snap.OpenInterest, snap.OIChangePct,
                snap.BidDepth, snap.AskDepth, snap.OBImbalance,
                snap.OBWallSize, snap.OBWallSide,
                snap.RSI,
                snap.MACDLine, snap.MACDSignal, snap.MACDHistogram,
                snap.BBUpper, snap.BBMiddle, snap.BBLower, snap.BBBandwidth,
                snap.VolatilityRegime, snap.VolatilityPct,
                snap.PerpPremiumPct, snap.PerpPremiumLabel,
                snap.PriceZscore, snap.MeanReversionSignal,
                signal.Direction, signal.Confidence,
                strings.Join(signal.Reasons, ", "),
                regimeName(regime),
        )

        // Call OpenAI-compatible API
        reqBody := map[string]interface{}{
                "model":       a.cfg.AIModel,
                "temperature": a.cfg.AITemperature,
                "max_tokens":  a.cfg.AIMaxTokens,
                "messages": []map[string]string{
                        {"role": "system", "content": "You are a crypto trading analyst. Respond only in valid JSON format."},
                        {"role": "user", "content": prompt},
                },
        }

        body, _ := json.Marshal(reqBody)
        req, err := http.NewRequest("POST", a.cfg.AIAPIURL, strings.NewReader(string(body)))
        if err != nil {
                logMsg("ERROR", "AI: request creation failed: %v", err)
                return a.cachedAIDecision
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("Authorization", "Bearer "+a.cfg.AIAPIKey)

        client := &http.Client{Timeout: 30 * time.Second}
        resp, err := client.Do(req)
        if err != nil {
                logMsg("WARN", "AI: API call failed: %v", err)
                return a.cachedAIDecision
        }
        defer resp.Body.Close()

        if resp.StatusCode != 200 {
                respData, _ := io.ReadAll(resp.Body)
                respStr := string(respData)
                if len(respStr) > 200 { respStr = respStr[:200] }
                logMsg("WARN", "AI: API returned status %d: %s", resp.StatusCode, respStr)
                return a.cachedAIDecision
        }

        var apiResp map[string]interface{}
        if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
                logMsg("WARN", "AI: response decode failed: %v", err)
                return a.cachedAIDecision
        }

        // Extract content from response
        choices, ok := apiResp["choices"].([]interface{})
        if !ok || len(choices) == 0 {
                logMsg("WARN", "AI: no choices in response")
                return a.cachedAIDecision
        }
        choice, ok := choices[0].(map[string]interface{})
        if !ok {
                return a.cachedAIDecision
        }
        message, ok := choice["message"].(map[string]interface{})
        if !ok {
                return a.cachedAIDecision
        }
        content, ok := message["content"].(string)
        if !ok {
                return a.cachedAIDecision
        }

        // Parse JSON from content (may have markdown code blocks)
        content = strings.TrimSpace(content)
        content = strings.TrimPrefix(content, "```json")
        content = strings.TrimPrefix(content, "```")
        content = strings.TrimSuffix(content, "```")
        content = strings.TrimSpace(content)

        var decision AIDecision
        if err := json.Unmarshal([]byte(content), &decision); err != nil {
                logMsg("WARN", "AI: decision parse failed: %v (content: %s)", err, content[:min(200, len(content))])
                return a.cachedAIDecision
        }

        // Validate direction
        dir := strings.ToUpper(decision.Direction)
        if dir != "LONG" && dir != "SHORT" && dir != "NEUTRAL" {
                decision.Direction = "NEUTRAL"
        } else {
                decision.Direction = dir
        }

        // Clamp confidence
        if decision.Confidence < 0 { decision.Confidence = 0 }
        if decision.Confidence > 100 { decision.Confidence = 100 }

        // Default values
        if decision.Strategy == "" { decision.Strategy = "HOLD" }
        if decision.RiskAssessment == "" { decision.RiskAssessment = "MEDIUM" }

        a.cachedAIDecision = &decision
        a.lastAICall = time.Now()
        return &decision
}

func regimeName(r *MarketRegime) string {
        if r == nil { return "UNKNOWN" }
        return r.Regime
}

func min(a, b int) int {
        if a < b { return a }
        return b
}

func (a *Agent) fetchMarketData(snap *MarketSnapshot) {
        // AllMids
        mids, err := a.hl.GetAllMids()
        if err != nil {
                logMsg("ERROR", "AllMids error: %v", err)
                return
        }
        if priceStr, ok := mids[a.cfg.Coin]; ok {
                snap.Price, _ = strconv.ParseFloat(priceStr, 64)
        }

        // MetaAndAssetCtxs — find our coin by matching universe index
        meta, ctxs, err := a.hl.GetMetaAndAssetCtxs()
        if err == nil && len(ctxs) > 0 {
                // Find coin index from universe
                coinIdx := 0 // default to first
                for i, u := range meta {
                        if m, ok := u.(map[string]interface{}); ok {
                                if name, ok := m["name"].(string); ok && name == a.cfg.Coin {
                                        coinIdx = i
                                        break
                                }
                        }
                }
                if coinIdx < len(ctxs) {
                        if c, ok := ctxs[coinIdx].(map[string]interface{}); ok {
                                if v, ok := c["fundingRate"].(string); ok { snap.FundingRate, _ = strconv.ParseFloat(v, 64) }
                                if v, ok := c["openInterest"].(string); ok { snap.OpenInterest, _ = strconv.ParseFloat(v, 64) }
                                if v, ok := c["markPx"].(string); ok { snap.MarkPx, _ = strconv.ParseFloat(v, 64) }
                                if v, ok := c["prevDayPx"].(string); ok { snap.PrevDayPx, _ = strconv.ParseFloat(v, 64) }
                                if v, ok := c["dayNtlVlm"].(string); ok { snap.Volume, _ = strconv.ParseFloat(v, 64) }
                        }
                }
        }

        // OI Change % — computed from previous iteration's OI
        if a.analyzer.prevOI > 0 && snap.OpenInterest > 0 {
                snap.OIChangePct = (snap.OpenInterest - a.analyzer.prevOI) / a.analyzer.prevOI * 100
        }

        // L2 Order Book
        bids, asks, err := a.hl.GetL2Book(a.cfg.Coin)
        if err == nil {
                var bidDepth, askDepth float64
                for _, b := range bids {
                        if px, ok := b["px"].(string); ok {
                                if sz, ok := b["sz"].(string); ok {
                                        p, _ := strconv.ParseFloat(px, 64)
                                        s, _ := strconv.ParseFloat(sz, 64)
                                        bidDepth += p * s
                                }
                        }
                }
                for _, a := range asks {
                        if px, ok := a["px"].(string); ok {
                                if sz, ok := a["sz"].(string); ok {
                                        p, _ := strconv.ParseFloat(px, 64)
                                        s, _ := strconv.ParseFloat(sz, 64)
                                        askDepth += p * s
                                }
                        }
                }
                snap.BidDepth = bidDepth
                snap.AskDepth = askDepth

                // OB Imbalance
                if askDepth > 0 { snap.OBImbalance = bidDepth / askDepth }

                // OB Wall detection (top 5 levels)
                for i, b := range bids {
                        if i >= 5 { break }
                        if px, ok := b["px"].(string); ok {
                                if sz, ok := b["sz"].(string); ok {
                                        p, _ := strconv.ParseFloat(px, 64)
                                        s, _ := strconv.ParseFloat(sz, 64)
                                        wallUSD := p * s
                                        if wallUSD > snap.OBWallSize { snap.OBWallSize = wallUSD; snap.OBWallSide = "BID" }
                                }
                        }
                }
                for i, a := range asks {
                        if i >= 5 { break }
                        if px, ok := a["px"].(string); ok {
                                if sz, ok := a["sz"].(string); ok {
                                        p, _ := strconv.ParseFloat(px, 64)
                                        s, _ := strconv.ParseFloat(sz, 64)
                                        wallUSD := p * s
                                        if wallUSD > snap.OBWallSize { snap.OBWallSize = wallUSD; snap.OBWallSide = "ASK" }
                                }
                        }
                }

                // OFI approximation from depth changes
                if a.analyzer.prevBidDepth > 0 {
                        bidDelta := bidDepth - a.analyzer.prevBidDepth
                        askDelta := askDepth - a.analyzer.prevAskDepth
                        snap.OFIBidDelta = bidDelta
                        snap.OFIAskDelta = askDelta
                        snap.OFINet = bidDelta - askDelta

                        // CVD: accumulate net order flow as running total
                        netDelta := bidDelta - askDelta
                        a.analyzer.cvdAccum += netDelta
                        snap.CVD = a.analyzer.cvdAccum
                }
        }

        // Volatility regime
        if a.analyzer.prevPrice > 0 {
                changePct := math.Abs(snap.Price-a.analyzer.prevPrice)/a.analyzer.prevPrice*100
                snap.VolatilityPct = changePct
                if changePct < a.cfg.VolatilityLowPct {
                        snap.VolatilityRegime = "LOW"
                } else if changePct > a.cfg.VolatilityHighPct {
                        snap.VolatilityRegime = "HIGH"
                } else {
                        snap.VolatilityRegime = "MEDIUM"
                }

                snap.VolatilityMultiplier = 1.0
                if snap.VolatilityRegime == "HIGH" { snap.VolatilityMultiplier = 1.5 }
                if snap.VolatilityRegime == "LOW" { snap.VolatilityMultiplier = 0.7 }
        }

        // Perp Premium
        if snap.MarkPx > 0 && snap.PrevDayPx > 0 {
                snap.PerpPremiumPct = (snap.MarkPx - snap.PrevDayPx) / snap.PrevDayPx * 100
                snap.PerpPremiumLabel = "FAIR"
                if snap.PerpPremiumPct > a.cfg.PerpPremiumThreshold { snap.PerpPremiumLabel = "PREMIUM" }
                if snap.PerpPremiumPct < -a.cfg.PerpPremiumThreshold { snap.PerpPremiumLabel = "DISCOUNT" }
        }

        // Mean Reversion (z-score)
        if len(a.regime.snapshots) >= a.cfg.MeanReversionLookback {
                prices := make([]float64, len(a.regime.snapshots))
                for i, s := range a.regime.snapshots { prices[i] = s.Price }
                mean, std := meanStd(prices[len(prices)-a.cfg.MeanReversionLookback:])
                if std > 0 { snap.PriceZscore = (snap.Price - mean) / std }
                snap.MeanReversionSignal = "NONE"
                if snap.PriceZscore > a.cfg.MeanReversionStdMult { snap.MeanReversionSignal = "OVERBOUGHT" }
                if snap.PriceZscore < -a.cfg.MeanReversionStdMult { snap.MeanReversionSignal = "OVERSOLD" }
        }

        // Funding countdown
        if snap.FundingRate != 0 {
                // Approximate — real countdown needs nextFundingTime from API
                // For now, just set if FR is extreme
                snap.FundingNear = math.Abs(snap.FundingRate) > a.cfg.FundingRateExtreme*2
                if snap.FundingNear { snap.FundingCountdownMin = 15 }
        }

        // prev values updated in runIteration() AFTER Analyze() to avoid zero deltas
}

func (a *Agent) fetchIndicators(snap *MarketSnapshot) {
        // Fetch Binance candles (cached for 5 minutes)
        if len(a.candleCache) == 0 || time.Since(a.candleTime).Minutes() >= 5 {
                candles, err := fetchBinanceCandles(a.cfg.Coin+"USDT", "1h", 200)
                if err != nil {
                        logMsg("ERROR", "Binance fetch error: %v", err)
                        snap.ChartSource = "NONE"
                        return
                }
                a.candleCache = candles
                a.candleTime = time.Now()
                snap.ChartSource = "BINANCE"
        }

        closes := make([]float64, len(a.candleCache))
        for i, c := range a.candleCache { closes[i] = c.Close }

        // RSI
        rsiArr := calcRSI(closes, 14)
        if len(rsiArr) > 0 {
                for i := len(rsiArr) - 1; i >= 0; i-- {
                        if !math.IsNaN(rsiArr[i]) { snap.RSI = math.Round(rsiArr[i]*100)/100; break }
                }
        }

        // MACD
        macdLine, macdSignal, macdHist := calcMACD(closes)
        if len(macdLine) > 0 { snap.MACDLine = math.Round(macdLine[len(macdLine)-1]*10000)/10000 }
        if len(macdSignal) > 0 { snap.MACDSignal = math.Round(macdSignal[len(macdSignal)-1]*10000)/10000 }
        if len(macdHist) > 0 { snap.MACDHistogram = math.Round(macdHist[len(macdHist)-1]*10000)/10000 }

        // Bollinger Bands
        bbUpper, bbMiddle, bbLower := calcBollinger(closes, 20, 2.0)
        if len(bbUpper) > 0 {
                snap.BBUpper = math.Round(bbUpper[len(bbUpper)-1]*100)/100
                snap.BBMiddle = math.Round(bbMiddle[len(bbMiddle)-1]*100)/100
                snap.BBLower = math.Round(bbLower[len(bbLower)-1]*100)/100
                if snap.BBMiddle > 0 {
                        snap.BBBandwidth = math.Round((snap.BBUpper-snap.BBLower)/snap.BBMiddle*100*100)/100
                }
        }

        // ── Hurst (HCCCO) oscillator — server-side computation for DCA triggers ──
        // This serves as FALLBACK when no frontend triggers are pending.
        // Frontend sends triggers from multi-timeframe analysis (1m-1d) via TRIGGER_UPDATE,
        // which takes priority over this server-side 1h-only computation.
        if a.cfg.TriggerModeEnabled && len(a.candleCache) >= 35 {
                highs := make([]float64, len(a.candleCache))
                lows := make([]float64, len(a.candleCache))
                for i, c := range a.candleCache {
                        highs[i] = c.High
                        lows[i] = c.Low
                }
                hurstFast, _ := calcHCCCO(closes, highs, lows, 10, 30, 1.0, 3.0)
                if len(hurstFast) >= 2 {
                        hCurr := hurstFast[len(hurstFast)-1]
                        hPrev := hurstFast[len(hurstFast)-2]

                        // Check if frontend triggers are already pending — if so, don't overwrite them
                        a.triggerMu.Lock()
                        hasFrontendTriggers := a.triggerState.HurstCrossUp || a.triggerState.HurstCrossDown || a.triggerState.BBCrossLower || a.triggerState.BBCrossUpper
                        a.triggerMu.Unlock()

                        if !hasFrontendTriggers {
                                // Use proper cross detection (not level check) for BB triggers
                                hurstCrossUp := hPrev <= 0.0 && hCurr > 0.0
                                hurstCrossDown := hPrev >= 1.0 && hCurr < 1.0
                                var bbCrossLower, bbCrossUpper bool
                                if len(bbLower) >= 2 && len(bbUpper) >= 2 && len(closes) >= 2 {
                                        prevClose := closes[len(closes)-2]
                                        currClose := closes[len(closes)-1]
                                        bbLoPrev := bbLower[len(bbLower)-2]
                                        bbLoCurr := bbLower[len(bbLower)-1]
                                        bbUpPrev := bbUpper[len(bbUpper)-2]
                                        bbUpCurr := bbUpper[len(bbUpper)-1]
                                        // Cross BELOW lower BB: previous close >= lower BB AND current close < lower BB
                                        bbCrossLower = prevClose >= bbLoPrev && currClose < bbLoCurr
                                        // Cross ABOVE upper BB: previous close <= upper BB AND current close > upper BB
                                        bbCrossUpper = prevClose <= bbUpPrev && currClose > bbUpCurr
                                }

                                a.triggerMu.Lock()
                                a.triggerState.HurstCrossUp = hurstCrossUp
                                a.triggerState.HurstCrossDown = hurstCrossDown
                                a.triggerState.BBCrossLower = bbCrossLower
                                a.triggerState.BBCrossUpper = bbCrossUpper
                                if hurstCrossUp || hurstCrossDown || bbCrossLower || bbCrossUpper {
                                        a.triggerState.Timestamp = time.Now().UnixMilli()
                                        a.triggerState.Timeframe = "1h" // server-side fallback uses 1h candles
                                }
                                a.triggerMu.Unlock()
                        }
                }
        }
}

func meanStd(data []float64) (mean, std float64) {
        if len(data) == 0 { return 0, 0 }
        sum := 0.0
        for _, v := range data { sum += v }
        mean = sum / float64(len(data))
        varSq := 0.0
        for _, v := range data { varSq += (v - mean) * (v - mean) }
        std = math.Sqrt(varSq / float64(len(data)))
        return
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDALONE DESKTOP MODE — HandleStdinLine processes WS messages directly
// ═══════════════════════════════════════════════════════════════════════════════

// HandleStdinLine processes a JSON message from any source (WS or stdin).
// This replaces readStdinConfig() in standalone mode.
func (a *Agent) HandleStdinLine(line []byte) {
        line = []byte(strings.TrimSpace(string(line)))
        if len(line) == 0 { return }
        var update map[string]interface{}
        if err := json.Unmarshal(line, &update); err != nil { return }
        if t, ok := update["type"].(string); ok {
                if t == "CONFIG_UPDATE" {
                        a.cfg.ApplyStdinUpdate(update)
                        // Persist to disk in standalone mode
                        if a.hub != nil {
                                saveConfig(*a.cfg)
                        }
                        logMsg("INFO", "Config updated: $%.0f ×%d SL:%.1f%% TP:%.1f%% MinConf:%d%% ExitSLTP:%v HoldMin:%.1f",
                                a.cfg.OrderSizeUSD, a.cfg.Leverage, a.cfg.StopLossPct, a.cfg.TakeProfitPct, a.cfg.MinConfidence,
                                a.cfg.ExitOnlyOnSLTP, a.cfg.MinHoldMinutes)
                } else if t == "RUN_BACKTEST" {
                        go a.runBacktest(update)
                } else if t == "RESET_CB" {
                        a.cb.active = false
                        a.cb.reason = ""
                        a.cb.dailyStartBalance = a.paper.Balance
                        logMsg("INFO", "✅ Circuit Breaker ręcznie zresetowany")
                } else if t == "TRIGGER_UPDATE" {
                        a.triggerMu.Lock()
                        if v, ok := update["hurstCrossUp"]; ok {
                                if b, ok := v.(bool); ok { a.triggerState.HurstCrossUp = b }
                        }
                        if v, ok := update["hurstCrossDown"]; ok {
                                if b, ok := v.(bool); ok { a.triggerState.HurstCrossDown = b }
                        }
                        if v, ok := update["bbCrossLower"]; ok {
                                if b, ok := v.(bool); ok { a.triggerState.BBCrossLower = b }
                        }
                        if v, ok := update["bbCrossUpper"]; ok {
                                if b, ok := v.(bool); ok { a.triggerState.BBCrossUpper = b }
                        }
                        if v, ok := update["timeframe"]; ok {
                                if s, ok := v.(string); ok { a.triggerState.Timeframe = s }
                        }
                        a.triggerState.Timestamp = time.Now().UnixMilli()
                        ts := a.triggerState
                        a.triggerMu.Unlock()
                        logMsg("INFO", "🎯 Trigger update: H↑=%v H↓=%v BB<=%v BB>=%v TF=%s",
                                ts.HurstCrossUp, ts.HurstCrossDown, ts.BBCrossLower, ts.BBCrossUpper, ts.Timeframe)
                }
        }
}

// applyConfigMap applies a saved config map (from disk) to a Config struct.
// Similar to ApplyStdinUpdate but for full config persistence on startup.
func applyConfigMap(c *Config, saved map[string]interface{}) {
        // Reuse ApplyStdinUpdate — it handles all known keys
        c.ApplyStdinUpdate(saved)
        // Also handle keys not in ApplyStdinUpdate
        if v, ok := saved["coin"]; ok {
                if s, ok := v.(string); ok && s != "" { c.Coin = s }
        }
        if v, ok := saved["private_key"]; ok {
                if s, ok := v.(string); ok { c.PrivateKey = s }
        }
        if v, ok := saved["whale_wallets"]; ok {
                if s, ok := v.(string); ok { c.WhaleWallets = s }
        }
        if v, ok := saved["cryptopanic_api_key"]; ok {
                if s, ok := v.(string); ok { c.CryptopanicKey = s }
        }
        if v, ok := saved["glassnode_api_key"]; ok {
                if s, ok := v.(string); ok { c.GlassnodeKey = s }
        }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

func main() {
        // Detect standalone mode: HYPERA_STANDALONE=1 or no stdin pipe
        standalone := os.Getenv("HYPERA_STANDALONE") == "1" || !isStdinPipe()

        var cfg *Config
        if standalone {
                // Load config from %APPDATA%/HyperA/config.json
                cfgCfg := loadConfig()
                cfg = &cfgCfg
                logMsg("INFO", "🖥️  HyperA standalone desktop mode")
        } else {
                cfg = DefaultConfig()
                logMsg("INFO", "🔧 HyperA bridge mode (stdin/stdout)")
        }

        agent := NewAgent(cfg)
        globalAgent = agent

        ctx, cancel := context.WithCancel(context.Background())
        defer cancel()

        if standalone {
                // Start WS hub
                hub := NewWSHub(agent)
                agent.hub = hub
                go hub.Run()

                // Start HTTP server (serves embedded frontend + WS endpoint)
                port := 3000
                if p := os.Getenv("HYPERA_PORT"); p != "" {
                        if n, err := strconv.Atoi(p); err == nil { port = n }
                }
                if err := startHTTPServer(hub, port); err != nil {
                        logMsg("ERROR", "Failed to start HTTP server: %v", err)
                        os.Exit(1)
                }
        } else {
                // Bridge mode: read stdin for config updates
                go agent.readStdinConfig()
        }

        agent.Run(ctx)
}

// isStdinPipe returns true if stdin is a pipe (data is being piped in).
// Returns false if stdin is a terminal or absent (standalone mode).
func isStdinPipe() bool {
        stat, err := os.Stdin.Stat()
        if err != nil {
                return false
        }
        return (stat.Mode() & os.ModeCharDevice) == 0
}

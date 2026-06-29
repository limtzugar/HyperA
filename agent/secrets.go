// ============================================================
//  secrets.go — HYP-005: at-rest encryption for API keys
// ============================================================
//  PROBLEM (HYP-005):
//    Config file (config.json) stored API keys, private key, and
//    other credentials as PLAINTEXT JSON. Anyone with read access
//    to %APPDATA%/HyperA/config.json could steal the keys.
//
//  SOLUTION:
//    Wrap the secret-bearing fields in an {enc, nonce} envelope
//    encrypted with AES-256-GCM. The key is derived from a
//    machine-specific salt (hostname + username + app name) using
//    scrypt. This is NOT secure against an attacker who controls
//    the running process (they can read the key from memory) —
//    but it protects against:
//      • Accidental config file leak (e.g., user uploads it for support)
//      • Backup/sync services that copy %APPDATA% to cloud
//      • Other user accounts on the same machine
//
//  DESIGN CHOICES:
//    - AES-256-GCM: standard authenticated encryption
//    - scrypt N=2^15 r=8 p=1: ~150ms derive, brute-force expensive
//    - Machine binding: keys won't decrypt on a different machine
//      (intentional — prevents exfiltration)
//    - Backward compat: plaintext values are auto-encrypted on first
//      save; encrypted values are transparently decrypted on read.
//    - Envelope: {"enc":"base64","nonce":"base64"} so existing
//      JSON config layout is preserved.
// ============================================================

package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sync"

	"golang.org/x/crypto/scrypt"
)

// secretsKey is derived once at startup from machine-binding material.
// Stored globally to avoid recomputing scrypt on every config save/load.
var (
	secretsKey     []byte
	secretsKeyOnce sync.Once
	secretsKeyErr  error
)

// machineSalt returns bytes that uniquely identify this user account
// on this machine. Used as the scrypt salt for key derivation.
// NOT secret — its purpose is just to bind the encryption key to the
// local environment so the config file is non-portable.
func machineSalt() []byte {
	host, _ := os.Hostname()
	user := os.Getenv("USER")
	if user == "" {
		user = os.Getenv("USERNAME")
	}
	if user == "" {
		user = "unknown"
	}
	salt := fmt.Sprintf("hypera|%s|%s|%s", host, user, runtime.GOOS)
	h := sha256.Sum256([]byte(salt))
	return h[:]
}

// getSecretsKey lazily derives the AES-256 key from machineSalt.
// Uses scrypt with strong parameters (N=2^15 = 32768, r=8, p=1).
// Takes ~150ms on a modern CPU — acceptable because we cache the result.
func getSecretsKey() ([]byte, error) {
	secretsKeyOnce.Do(func() {
		salt := machineSalt()
		// 32 bytes = AES-256 key
		key, err := scrypt.Key([]byte("hypera-secrets-v1"), salt, 1<<15, 8, 1, 32)
		if err != nil {
			secretsKeyErr = fmt.Errorf("scrypt key derivation failed: %w", err)
			return
		}
		secretsKey = key
	})
	return secretsKey, secretsKeyErr
}

// SecretEnvelope is the JSON shape stored in config.json for encrypted fields.
// Existing plaintext strings are auto-migrated on first save.
type SecretEnvelope struct {
	Enc   string `json:"enc"`   // base64-encoded ciphertext (AES-256-GCM)
	Nonce string `json:"nonce"` // base64-encoded nonce (12 bytes)
}

// encryptSecret encrypts a plaintext string and returns a SecretEnvelope.
// Returns an error if the crypto setup is broken (should never happen).
func encryptSecret(plaintext string) (SecretEnvelope, error) {
	if plaintext == "" {
		return SecretEnvelope{}, nil
	}
	key, err := getSecretsKey()
	if err != nil {
		return SecretEnvelope{}, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return SecretEnvelope{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return SecretEnvelope{}, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return SecretEnvelope{}, err
	}
	ct := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	return SecretEnvelope{
		Enc:   base64.StdEncoding.EncodeToString(ct),
		Nonce: base64.StdEncoding.EncodeToString(nonce),
	}, nil
}

// decryptSecret reverses encryptSecret. If env.Enc is empty, returns "".
// Returns an error if the ciphertext is corrupt or was encrypted on
// a different machine (key mismatch → GCM auth tag fails).
func decryptSecret(env SecretEnvelope) (string, error) {
	if env.Enc == "" {
		return "", nil
	}
	key, err := getSecretsKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ct, err := base64.StdEncoding.DecodeString(env.Enc)
	if err != nil {
		return "", fmt.Errorf("invalid base64 in enc: %w", err)
	}
	nonce, err := base64.StdEncoding.DecodeString(env.Nonce)
	if err != nil {
		return "", fmt.Errorf("invalid base64 in nonce: %w", err)
	}
	if len(nonce) != gcm.NonceSize() {
		return "", fmt.Errorf("nonce size mismatch: got %d, want %d", len(nonce), gcm.NonceSize())
	}
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (likely wrong machine): %w", err)
	}
	return string(pt), nil
}

// secretFieldToEnvelope converts a value that might be either:
//   - a plaintext string (legacy config), or
//   - a SecretEnvelope object (encrypted)
// to a SecretEnvelope. If the input is a plaintext string, it gets
// encrypted on the spot (auto-migration). If it's already an envelope,
// it's passed through unchanged.
func secretFieldToEnvelope(v interface{}) (SecretEnvelope, bool, error) {
	// Already an envelope?
	if m, ok := v.(map[string]interface{}); ok {
		enc, _ := m["enc"].(string)
		nonce, _ := m["nonce"].(string)
		if enc != "" || nonce != "" {
			return SecretEnvelope{Enc: enc, Nonce: nonce}, true, nil
		}
	}
	// Plaintext string — encrypt it
	if s, ok := v.(string); ok {
		env, err := encryptSecret(s)
		if err != nil {
			return SecretEnvelope{}, false, err
		}
		return env, false, nil
	}
	// nil / missing
	return SecretEnvelope{}, false, nil
}

// encryptConfigSecrets walks a parsed config map and replaces any
// plaintext secret fields with SecretEnvelope objects.
// Secret field names are defined in SECRET_FIELDS.
// This is called BEFORE writing the config to disk.
func encryptConfigSecrets(cfg map[string]interface{}) error {
	secretFields := []string{
		"private_key",
		"ai_api_key",
		"cryptopanic_api_key",
		"glassnode_api_key",
	}
	for _, field := range secretFields {
		v, ok := cfg[field]
		if !ok {
			continue
		}
		env, alreadyEnc, err := secretFieldToEnvelope(v)
		if err != nil {
			return fmt.Errorf("encrypt %s: %w", field, err)
		}
		if alreadyEnc {
			// Already an envelope — keep as is
			continue
		}
		// Replace plaintext with envelope (or delete if empty)
		if env.Enc == "" {
			delete(cfg, field)
		} else {
			cfg[field] = map[string]interface{}{
				"enc":   env.Enc,
				"nonce": env.Nonce,
			}
		}
	}
	return nil
}

// decryptConfigSecrets walks a parsed config map and replaces any
// SecretEnvelope objects with their decrypted plaintext strings.
// This is called AFTER reading the config from disk.
// If decryption fails (e.g., wrong machine), the field is set to ""
// and an error is logged but NOT returned — we don't want to crash
// the whole app just because one key can't be decrypted.
func decryptConfigSecrets(cfg map[string]interface{}) error {
	secretFields := []string{
		"private_key",
		"ai_api_key",
		"cryptopanic_api_key",
		"glassnode_api_key",
	}
	for _, field := range secretFields {
		v, ok := cfg[field]
		if !ok {
			continue
		}
		m, ok := v.(map[string]interface{})
		if !ok {
			// Plaintext — leave as is (will be encrypted on next save)
			continue
		}
		enc, _ := m["enc"].(string)
		nonce, _ := m["nonce"].(string)
		if enc == "" && nonce == "" {
			continue
		}
		pt, err := decryptSecret(SecretEnvelope{Enc: enc, Nonce: nonce})
		if err != nil {
			logMsg("ERROR", "Failed to decrypt %s: %v (will be reset)", field, err)
			delete(cfg, field)
			continue
		}
		cfg[field] = pt
	}
	return nil
}

// MarshalEncryptedConfig serializes the config map with secret fields
// encrypted. Returns the JSON bytes ready to write to disk.
func MarshalEncryptedConfig(cfg map[string]interface{}) ([]byte, error) {
	// Make a deep copy so we don't mutate the caller's map
	copy := make(map[string]interface{}, len(cfg))
	for k, v := range cfg {
		copy[k] = v
	}
	if err := encryptConfigSecrets(copy); err != nil {
		return nil, err
	}
	return json.MarshalIndent(copy, "", "  ")
}

// UnmarshalEncryptedConfig parses JSON config bytes and decrypts any
// secret envelope fields into plaintext in the returned map.
func UnmarshalEncryptedConfig(data []byte) (map[string]interface{}, error) {
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if err := decryptConfigSecrets(cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

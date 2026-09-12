package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
)

func restoreEnv(name, value string, existed bool) {
	if existed {
		_ = os.Setenv(name, value)
	} else {
		_ = os.Unsetenv(name)
	}
}

func TestStandaloneAPIKeyIdentity(t *testing.T) {
	env := []struct {
		name  string
		value string
	}{
		{standaloneAPIKeyEnv, "secret"},
		{standaloneAPIUserEnv, "machine-user"},
		{standaloneAPISupplier, "supplier-1"},
		{standaloneAPIAppCode, "machine-app"},
	}
	previous := make([]struct {
		name  string
		value string
		had   bool
	}, len(env))
	for i, item := range env {
		previous[i].name = item.name
		previous[i].value, previous[i].had = os.LookupEnv(item.name)
		_ = os.Setenv(item.name, item.value)
	}
	defer func() {
		for _, item := range previous {
			restoreEnv(item.name, item.value, item.had)
		}
	}()

	tests := []struct {
		name       string
		key        string
		bearer     string
		configured bool
		presented  bool
		user       string
	}{
		{name: "api key", key: "secret", configured: true, presented: true, user: "machine-user"},
		{name: "bearer alias", bearer: "Bearer secret", configured: true, presented: true, user: "machine-user"},
		{name: "missing", configured: true, presented: false},
		{name: "invalid", key: "wrong", configured: true, presented: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			header := make(http.Header)
			if tt.key != "" {
				header.Set(standaloneAPIKeyHeader, tt.key)
			}
			if tt.bearer != "" {
				header.Set("Authorization", tt.bearer)
			}
			identity, configured, presented := standaloneAPIKeyIdentity(header)
			if configured != tt.configured || presented != tt.presented {
				t.Fatalf("identity state = (%v, %v), want (%v, %v)", configured, presented, tt.configured, tt.presented)
			}
			if identity.User != tt.user {
				t.Fatalf("identity user = %q, want %q", identity.User, tt.user)
			}
		})
	}
}

func TestStandaloneAPIKeyProxyRejectsMissingKeyWhenRequired(t *testing.T) {
	oldKey, hadKey := os.LookupEnv(standaloneAPIKeyEnv)
	oldRequired, hadRequired := os.LookupEnv(standaloneAPIKeyRequiredEnv)
	defer func() {
		restoreEnv(standaloneAPIKeyEnv, oldKey, hadKey)
		restoreEnv(standaloneAPIKeyRequiredEnv, oldRequired, hadRequired)
	}()
	_ = os.Unsetenv(standaloneAPIKeyEnv)
	_ = os.Setenv(standaloneAPIKeyRequiredEnv, "true")

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(StandaloneAPIKeyProxy(nil))
	router.GET("/api/v3/find/object", func(c *gin.Context) { c.Status(http.StatusTeapot) })
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, httptest.NewRequest(http.MethodGet, "/api/v3/find/object", nil))
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.Code, http.StatusUnauthorized)
	}
}

func TestStandaloneAPIKeyProxyRejectsInvalidKey(t *testing.T) {
	oldKey, hadKey := os.LookupEnv(standaloneAPIKeyEnv)
	oldRequired, hadRequired := os.LookupEnv(standaloneAPIKeyRequiredEnv)
	defer func() {
		restoreEnv(standaloneAPIKeyEnv, oldKey, hadKey)
		restoreEnv(standaloneAPIKeyRequiredEnv, oldRequired, hadRequired)
	}()
	_ = os.Setenv(standaloneAPIKeyEnv, "secret")
	_ = os.Unsetenv(standaloneAPIKeyRequiredEnv)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(StandaloneAPIKeyProxy(nil))
	router.GET("/api/v3/find/object", func(c *gin.Context) { c.Status(http.StatusTeapot) })
	resp := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v3/find/object", nil)
	req.Header.Set(standaloneAPIKeyHeader, "wrong")
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.Code, http.StatusUnauthorized)
	}
}

func TestSanitizeExternalIdentityHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(SanitizeExternalIdentityHeaders())
	router.GET("/api/v3/find/object", func(c *gin.Context) {
		if got := c.GetHeader("X-Bkcmdb-User"); got != "" {
			t.Fatalf("user header survived sanitization: %q", got)
		}
		c.Status(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v3/find/object", nil)
	req.Header.Set("X-Bkcmdb-User", "attacker")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", resp.Code, http.StatusNoContent)
	}

	duplicate := httptest.NewRequest(http.MethodGet, "/api/v3/find/object", nil)
	duplicate.Header.Add("X-Bkcmdb-User", "one")
	duplicate.Header.Add("X-Bkcmdb-User", "two")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, duplicate)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("duplicate status = %d, want %d", resp.Code, http.StatusBadRequest)
	}
}

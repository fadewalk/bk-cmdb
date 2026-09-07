package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestStandaloneAPIKeyIdentity(t *testing.T) {
	oldKey, hadKey := os.LookupEnv(standaloneAPIKeyEnv)
	defer func() {
		if hadKey {
			_ = os.Setenv(standaloneAPIKeyEnv, oldKey)
		} else {
			_ = os.Unsetenv(standaloneAPIKeyEnv)
		}
	}()

	_ = os.Setenv(standaloneAPIKeyEnv, "secret")

	tests := []struct {
		name       string
		key        string
		bearer     string
		configured bool
		presented  bool
		user       string
	}{
		{name: "api key", key: "secret", configured: true, presented: true, user: "admin"},
		{name: "bearer alias", bearer: "Bearer secret", configured: true, presented: true, user: "admin"},
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

func TestStandaloneAPIKeyProxyRejectsInvalidKey(t *testing.T) {
	oldKey, hadKey := os.LookupEnv(standaloneAPIKeyEnv)
	defer func() {
		if hadKey {
			_ = os.Setenv(standaloneAPIKeyEnv, oldKey)
		} else {
			_ = os.Unsetenv(standaloneAPIKeyEnv)
		}
	}()
	_ = os.Setenv(standaloneAPIKeyEnv, "secret")

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(StandaloneAPIKeyProxy(nil))
	router.GET("/api/v3/find/object", func(c *gin.Context) {
		c.Status(http.StatusTeapot)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v3/find/object", nil)
	req.Header.Set(standaloneAPIKeyHeader, "wrong")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)

	if resp.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.Code, http.StatusUnauthorized)
	}
}
